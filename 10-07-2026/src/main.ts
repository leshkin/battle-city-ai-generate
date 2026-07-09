import "./styles.css";

const COLS = 26;
const ROWS = 26;
const TILE_SIZE = 32;

const WIDTH = COLS * TILE_SIZE;
const HEIGHT = ROWS * TILE_SIZE;

const PLAYER_SPEED = 112;
const ENEMY_SPEED = 70;
const BULLET_SPEED = 350;

const TOTAL_ENEMIES = 20;
const MAX_ACTIVE_ENEMIES = 4;

type Direction = "up" | "down" | "left" | "right";
type TankKind = "player" | "enemy";
type GameState = "menu" | "running" | "paused" | "won" | "lost";

enum Tile {
  Empty,
  Brick,
  Steel,
  Water,
  Bush,
}

interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Tank {
  x: number;
  y: number;
  width: number;
  height: number;

  direction: Direction;
  kind: TankKind;
  speed: number;
  color: string;

  alive: boolean;
  invulnerable: number;
  fireCooldown: number;

  turnTimer: number;
  fireTimer: number;
}

interface Bullet {
  x: number;
  y: number;
  radius: number;
  direction: Direction;
  owner: TankKind;
  speed: number;
  alive: boolean;
}

const DIRECTIONS: Record<Direction, { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const canvas = document.querySelector<HTMLCanvasElement>("#game");
const overlay = document.querySelector<HTMLDivElement>("#overlay");
const overlayTitle = document.querySelector<HTMLHeadingElement>("#overlay-title");
const overlayText = document.querySelector<HTMLParagraphElement>("#overlay-text");
const startButton = document.querySelector<HTMLButtonElement>("#start-button");

const scoreElement = document.querySelector<HTMLElement>("#score");
const livesElement = document.querySelector<HTMLElement>("#lives");
const enemiesElement = document.querySelector<HTMLElement>("#enemies");
const statusElement = document.querySelector<HTMLElement>("#status");

if (
  !canvas ||
  !overlay ||
  !overlayTitle ||
  !overlayText ||
  !startButton ||
  !scoreElement ||
  !livesElement ||
  !enemiesElement ||
  !statusElement
) {
  throw new Error("Не удалось найти необходимые HTML-элементы.");
}

class BattleCityGame {
  private readonly context: CanvasRenderingContext2D;
  private readonly keys = new Set<string>();

  private grid: Tile[] = [];
  private player!: Tank;
  private enemies: Tank[] = [];
  private bullets: Bullet[] = [];

  private state: GameState = "menu";
  private score = 0;
  private lives = 3;

  private spawnedEnemies = 0;
  private destroyedEnemies = 0;
  private spawnTimer = 0;

  private lastTime = performance.now();

  private readonly playerSpawn = {
    x: 8 * TILE_SIZE + 2,
    y: 24 * TILE_SIZE + 2,
  };

  private readonly base: Rectangle & { alive: boolean } = {
    x: 12 * TILE_SIZE,
    y: 24 * TILE_SIZE,
    width: TILE_SIZE * 2,
    height: TILE_SIZE * 2,
    alive: true,
  };

  public constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Canvas 2D не поддерживается браузером.");
    }

    this.context = context;
    this.context.imageSmoothingEnabled = false;

    this.canvas.width = WIDTH;
    this.canvas.height = HEIGHT;

    this.bindEvents();
    this.createLevel();
    this.createPlayer();

    requestAnimationFrame(this.loop);
  }

  public start(): void {
    this.score = 0;
    this.lives = 3;

    this.spawnedEnemies = 0;
    this.destroyedEnemies = 0;
    this.spawnTimer = 0;

    this.enemies = [];
    this.bullets = [];

    this.base.alive = true;

    this.createLevel();
    this.createPlayer();

    this.state = "running";
    this.lastTime = performance.now();

    this.hideOverlay();
    this.updateHud();
  }

  private readonly loop = (time: number): void => {
    const deltaSeconds = Math.min((time - this.lastTime) / 1000, 0.033);
    this.lastTime = time;

    if (this.state === "running") {
      this.update(deltaSeconds);
    }

    this.render();
    requestAnimationFrame(this.loop);
  };

  private update(deltaTime: number): void {
    this.updatePlayer(deltaTime);
    this.updateEnemies(deltaTime);
    this.updateBullets(deltaTime);
    this.updateSpawning(deltaTime);

    this.enemies = this.enemies.filter((enemy) => enemy.alive);
    this.bullets = this.bullets.filter((bullet) => bullet.alive);

    if (
      this.spawnedEnemies >= TOTAL_ENEMIES &&
      this.destroyedEnemies >= TOTAL_ENEMIES &&
      this.enemies.length === 0
    ) {
      this.win();
    }

    this.updateHud();
  }

  private createPlayer(): void {
    this.player = {
      x: this.playerSpawn.x,
      y: this.playerSpawn.y,
      width: 28,
      height: 28,

      direction: "up",
      kind: "player",
      speed: PLAYER_SPEED,
      color: "#f2c94c",

      alive: true,
      invulnerable: 2.5,
      fireCooldown: 0,

      turnTimer: 0,
      fireTimer: 0,
    };
  }

  private createEnemy(x: number, y: number): Tank {
    const colors = ["#ef5350", "#ff8a65", "#ab47bc", "#42a5f5"];

    return {
      x,
      y,
      width: 28,
      height: 28,

      direction: "down",
      kind: "enemy",
      speed: ENEMY_SPEED + Math.random() * 16,
      color: colors[Math.floor(Math.random() * colors.length)],

      alive: true,
      invulnerable: 0.8,
      fireCooldown: 0,

      turnTimer: 0.4 + Math.random() * 1.2,
      fireTimer: 0.6 + Math.random() * 1.3,
    };
  }

  private updatePlayer(deltaTime: number): void {
    if (!this.player.alive) {
      return;
    }

    this.player.invulnerable = Math.max(
      0,
      this.player.invulnerable - deltaTime,
    );

    this.player.fireCooldown = Math.max(
      0,
      this.player.fireCooldown - deltaTime,
    );

    let direction: Direction | null = null;

    if (this.isKeyDown("ArrowUp", "KeyW")) {
      direction = "up";
    } else if (this.isKeyDown("ArrowDown", "KeyS")) {
      direction = "down";
    } else if (this.isKeyDown("ArrowLeft", "KeyA")) {
      direction = "left";
    } else if (this.isKeyDown("ArrowRight", "KeyD")) {
      direction = "right";
    }

    if (direction) {
      this.player.direction = direction;

      const vector = DIRECTIONS[direction];

      this.moveTank(
        this.player,
        vector.x * this.player.speed * deltaTime,
        vector.y * this.player.speed * deltaTime,
      );
    }

    if (this.keys.has("Space")) {
      this.fire(this.player);
    }
  }

  private updateEnemies(deltaTime: number): void {
    for (const enemy of this.enemies) {
      if (!enemy.alive) {
        continue;
      }

      enemy.invulnerable = Math.max(0, enemy.invulnerable - deltaTime);
      enemy.fireCooldown = Math.max(0, enemy.fireCooldown - deltaTime);
      enemy.turnTimer -= deltaTime;
      enemy.fireTimer -= deltaTime;

      if (enemy.turnTimer <= 0) {
        enemy.direction = this.chooseEnemyDirection(enemy);
        enemy.turnTimer = 0.45 + Math.random() * 1.5;
      }

      const vector = DIRECTIONS[enemy.direction];

      const moved = this.moveTank(
        enemy,
        vector.x * enemy.speed * deltaTime,
        vector.y * enemy.speed * deltaTime,
      );

      if (!moved) {
        enemy.direction = this.randomDirection();
        enemy.turnTimer = 0.15 + Math.random() * 0.35;
      }

      if (enemy.fireTimer <= 0) {
        this.fire(enemy);
        enemy.fireTimer = 0.65 + Math.random() * 1.5;
      }
    }
  }

  private chooseEnemyDirection(enemy: Tank): Direction {
    if (Math.random() < 0.55) {
      const enemyCenterX = enemy.x + enemy.width / 2;
      const enemyCenterY = enemy.y + enemy.height / 2;

      const targetX = this.base.x + this.base.width / 2;
      const targetY = this.base.y + this.base.height / 2;

      const differenceX = targetX - enemyCenterX;
      const differenceY = targetY - enemyCenterY;

      if (Math.abs(differenceX) > Math.abs(differenceY)) {
        return differenceX < 0 ? "left" : "right";
      }

      return differenceY < 0 ? "up" : "down";
    }

    return this.randomDirection();
  }

  private randomDirection(): Direction {
    const directions: Direction[] = ["up", "down", "left", "right"];
    return directions[Math.floor(Math.random() * directions.length)];
  }

  private moveTank(tank: Tank, deltaX: number, deltaY: number): boolean {
    const nextRectangle: Rectangle = {
      x: tank.x + deltaX,
      y: tank.y + deltaY,
      width: tank.width,
      height: tank.height,
    };

    if (
      nextRectangle.x < 0 ||
      nextRectangle.y < 0 ||
      nextRectangle.x + nextRectangle.width > WIDTH ||
      nextRectangle.y + nextRectangle.height > HEIGHT
    ) {
      return false;
    }

    if (this.collidesWithSolidMap(nextRectangle)) {
      return false;
    }

    if (this.base.alive && rectanglesOverlap(nextRectangle, this.base)) {
      return false;
    }

    const tanks = [this.player, ...this.enemies];

    for (const otherTank of tanks) {
      if (
        otherTank === tank ||
        !otherTank.alive ||
        otherTank.invulnerable > 2.4
      ) {
        continue;
      }

      if (rectanglesOverlap(nextRectangle, otherTank)) {
        return false;
      }
    }

    tank.x = nextRectangle.x;
    tank.y = nextRectangle.y;

    return true;
  }

  private collidesWithSolidMap(rectangle: Rectangle): boolean {
    const startColumn = Math.floor(rectangle.x / TILE_SIZE);
    const endColumn = Math.floor(
      (rectangle.x + rectangle.width - 1) / TILE_SIZE,
    );

    const startRow = Math.floor(rectangle.y / TILE_SIZE);
    const endRow = Math.floor(
      (rectangle.y + rectangle.height - 1) / TILE_SIZE,
    );

    for (let row = startRow; row <= endRow; row += 1) {
      for (let column = startColumn; column <= endColumn; column += 1) {
        const tile = this.getTile(column, row);

        if (
          tile === Tile.Brick ||
          tile === Tile.Steel ||
          tile === Tile.Water
        ) {
          return true;
        }
      }
    }

    return false;
  }

  private fire(tank: Tank): void {
    if (!tank.alive || tank.fireCooldown > 0) {
      return;
    }

    const vector = DIRECTIONS[tank.direction];

    const centerX = tank.x + tank.width / 2;
    const centerY = tank.y + tank.height / 2;

    const distance = tank.width / 2 + 5;

    this.bullets.push({
      x: centerX + vector.x * distance,
      y: centerY + vector.y * distance,
      radius: 4,
      direction: tank.direction,
      owner: tank.kind,
      speed: BULLET_SPEED,
      alive: true,
    });

    tank.fireCooldown = tank.kind === "player" ? 0.25 : 0.7;
  }

  private updateBullets(deltaTime: number): void {
    for (const bullet of this.bullets) {
      if (!bullet.alive) {
        continue;
      }

      const vector = DIRECTIONS[bullet.direction];
      const distance = bullet.speed * deltaTime;

      // Подшаги предотвращают прохождение быстрой пули сквозь стену.
      const steps = Math.max(1, Math.ceil(distance / 6));
      const stepDistance = distance / steps;

      for (let step = 0; step < steps && bullet.alive; step += 1) {
        bullet.x += vector.x * stepDistance;
        bullet.y += vector.y * stepDistance;

        if (
          bullet.x < 0 ||
          bullet.y < 0 ||
          bullet.x >= WIDTH ||
          bullet.y >= HEIGHT
        ) {
          bullet.alive = false;
          break;
        }

        if (this.handleBulletMapCollision(bullet)) {
          break;
        }

        if (
          this.base.alive &&
          rectanglesOverlap(this.getBulletRectangle(bullet), this.base)
        ) {
          bullet.alive = false;
          this.destroyBase();
          break;
        }

        if (this.handleBulletTankCollision(bullet)) {
          break;
        }
      }
    }

    this.handleBulletToBulletCollisions();
  }

  private handleBulletMapCollision(bullet: Bullet): boolean {
    const rectangle = this.getBulletRectangle(bullet);

    const startColumn = Math.floor(rectangle.x / TILE_SIZE);
    const endColumn = Math.floor(
      (rectangle.x + rectangle.width - 1) / TILE_SIZE,
    );

    const startRow = Math.floor(rectangle.y / TILE_SIZE);
    const endRow = Math.floor(
      (rectangle.y + rectangle.height - 1) / TILE_SIZE,
    );

    for (let row = startRow; row <= endRow; row += 1) {
      for (let column = startColumn; column <= endColumn; column += 1) {
        const tile = this.getTile(column, row);

        if (tile === Tile.Brick) {
          this.setTile(column, row, Tile.Empty);
          bullet.alive = false;
          return true;
        }

        if (tile === Tile.Steel) {
          bullet.alive = false;
          return true;
        }
      }
    }

    return false;
  }

  private handleBulletTankCollision(bullet: Bullet): boolean {
    const bulletRectangle = this.getBulletRectangle(bullet);

    if (
      bullet.owner === "enemy" &&
      this.player.alive &&
      this.player.invulnerable <= 0 &&
      rectanglesOverlap(bulletRectangle, this.player)
    ) {
      bullet.alive = false;
      this.hitPlayer();
      return true;
    }

    if (bullet.owner === "player") {
      for (const enemy of this.enemies) {
        if (
          enemy.alive &&
          enemy.invulnerable <= 0 &&
          rectanglesOverlap(bulletRectangle, enemy)
        ) {
          enemy.alive = false;
          bullet.alive = false;

          this.score += 100;
          this.destroyedEnemies += 1;

          return true;
        }
      }
    }

    return false;
  }

  private handleBulletToBulletCollisions(): void {
    for (let first = 0; first < this.bullets.length; first += 1) {
      const firstBullet = this.bullets[first];

      if (!firstBullet.alive) {
        continue;
      }

      for (
        let second = first + 1;
        second < this.bullets.length;
        second += 1
      ) {
        const secondBullet = this.bullets[second];

        if (
          !secondBullet.alive ||
          firstBullet.owner === secondBullet.owner
        ) {
          continue;
        }

        if (
          rectanglesOverlap(
            this.getBulletRectangle(firstBullet),
            this.getBulletRectangle(secondBullet),
          )
        ) {
          firstBullet.alive = false;
          secondBullet.alive = false;
        }
      }
    }
  }

  private getBulletRectangle(bullet: Bullet): Rectangle {
    return {
      x: bullet.x - bullet.radius,
      y: bullet.y - bullet.radius,
      width: bullet.radius * 2,
      height: bullet.radius * 2,
    };
  }

  private hitPlayer(): void {
    if (this.player.invulnerable > 0) {
      return;
    }

    this.lives -= 1;

    if (this.lives <= 0) {
      this.player.alive = false;
      this.lose("Все танки уничтожены");
      return;
    }

    this.player.x = this.playerSpawn.x;
    this.player.y = this.playerSpawn.y;
    this.player.direction = "up";
    this.player.invulnerable = 2.5;

    // Удаляем вражеские пули рядом с точкой возрождения.
    for (const bullet of this.bullets) {
      if (
        bullet.owner === "enemy" &&
        distanceBetween(
          bullet.x,
          bullet.y,
          this.player.x + this.player.width / 2,
          this.player.y + this.player.height / 2,
        ) < 80
      ) {
        bullet.alive = false;
      }
    }
  }

  private destroyBase(): void {
    this.base.alive = false;
    this.lose("База уничтожена");
  }

  private updateSpawning(deltaTime: number): void {
    if (
      this.spawnedEnemies >= TOTAL_ENEMIES ||
      this.enemies.length >= MAX_ACTIVE_ENEMIES
    ) {
      return;
    }

    this.spawnTimer -= deltaTime;

    if (this.spawnTimer > 0) {
      return;
    }

    const spawnColumns = [0, 12, 24];
    const shuffledColumns = [...spawnColumns].sort(() => Math.random() - 0.5);

    for (const column of shuffledColumns) {
      const x = column * TILE_SIZE + 2;
      const y = 2;

      const spawnRectangle: Rectangle = {
        x,
        y,
        width: 28,
        height: 28,
      };

      const occupied = [this.player, ...this.enemies].some(
        (tank) => tank.alive && rectanglesOverlap(spawnRectangle, tank),
      );

      if (!occupied && !this.collidesWithSolidMap(spawnRectangle)) {
        this.enemies.push(this.createEnemy(x, y));
        this.spawnedEnemies += 1;
        break;
      }
    }

    this.spawnTimer = 1.4;
  }

  private createLevel(): void {
    this.grid = new Array<Tile>(COLS * ROWS).fill(Tile.Empty);

    const brick = Tile.Brick;
    const steel = Tile.Steel;
    const water = Tile.Water;
    const bush = Tile.Bush;

    // Верхняя часть.
    this.block(2, 3, 2, 4, brick);
    this.block(6, 2, 2, 5, brick);
    this.block(10, 3, 2, 3, brick);
    this.block(14, 3, 2, 3, brick);
    this.block(18, 2, 2, 5, brick);
    this.block(22, 3, 2, 4, brick);

    // Стальные укрепления.
    this.block(0, 8, 4, 1, steel);
    this.block(7, 8, 3, 1, steel);
    this.block(16, 8, 3, 1, steel);
    this.block(22, 8, 4, 1, steel);

    // Центральная зона.
    this.block(4, 10, 2, 5, brick);
    this.block(9, 10, 2, 4, brick);
    this.block(15, 10, 2, 4, brick);
    this.block(20, 10, 2, 5, brick);

    this.block(11, 11, 4, 2, water);
    this.block(11, 13, 4, 2, water);

    // Кусты маскируют танки.
    this.block(1, 16, 5, 2, bush);
    this.block(10, 16, 6, 2, bush);
    this.block(20, 16, 5, 2, bush);

    // Нижняя часть.
    this.block(2, 19, 2, 4, brick);
    this.block(6, 18, 2, 5, brick);
    this.block(10, 19, 2, 3, brick);
    this.block(14, 19, 2, 3, brick);
    this.block(18, 18, 2, 5, brick);
    this.block(22, 19, 2, 4, brick);

    this.block(0, 23, 4, 1, steel);
    this.block(22, 23, 4, 1, steel);

    // Защита базы.
    this.block(11, 23, 4, 1, brick);
    this.block(11, 24, 1, 2, brick);
    this.block(14, 24, 1, 2, brick);

    // Очищаем зоны появления.
    this.block(0, 0, 2, 2, Tile.Empty);
    this.block(12, 0, 2, 2, Tile.Empty);
    this.block(24, 0, 2, 2, Tile.Empty);
    this.block(8, 24, 2, 2, Tile.Empty);
  }

  private block(
    x: number,
    y: number,
    width: number,
    height: number,
    tile: Tile,
  ): void {
    for (let row = y; row < y + height; row += 1) {
      for (let column = x; column < x + width; column += 1) {
        this.setTile(column, row, tile);
      }
    }
  }

  private getTile(column: number, row: number): Tile {
    if (column < 0 || row < 0 || column >= COLS || row >= ROWS) {
      return Tile.Steel;
    }

    return this.grid[row * COLS + column];
  }

  private setTile(column: number, row: number, tile: Tile): void {
    if (column < 0 || row < 0 || column >= COLS || row >= ROWS) {
      return;
    }

    this.grid[row * COLS + column] = tile;
  }

  private render(): void {
    const context = this.context;

    context.clearRect(0, 0, WIDTH, HEIGHT);
    context.fillStyle = "#050505";
    context.fillRect(0, 0, WIDTH, HEIGHT);

    this.drawGridBackground();
    this.drawMap(false);
    this.drawBase();

    for (const bullet of this.bullets) {
      if (bullet.alive) {
        this.drawBullet(bullet);
      }
    }

    if (this.player.alive) {
      this.drawTank(this.player);
    }

    for (const enemy of this.enemies) {
      if (enemy.alive) {
        this.drawTank(enemy);
      }
    }

    // Кусты рисуются поверх объектов.
    this.drawMap(true);
  }

  private drawGridBackground(): void {
    const context = this.context;

    context.strokeStyle = "rgba(255, 255, 255, 0.015)";
    context.lineWidth = 1;

    for (let x = 0; x <= WIDTH; x += TILE_SIZE) {
      context.beginPath();
      context.moveTo(x + 0.5, 0);
      context.lineTo(x + 0.5, HEIGHT);
      context.stroke();
    }

    for (let y = 0; y <= HEIGHT; y += TILE_SIZE) {
      context.beginPath();
      context.moveTo(0, y + 0.5);
      context.lineTo(WIDTH, y + 0.5);
      context.stroke();
    }
  }

  private drawMap(onlyBushes: boolean): void {
    for (let row = 0; row < ROWS; row += 1) {
      for (let column = 0; column < COLS; column += 1) {
        const tile = this.getTile(column, row);

        if (onlyBushes && tile !== Tile.Bush) {
          continue;
        }

        if (!onlyBushes && tile === Tile.Bush) {
          continue;
        }

        this.drawTile(column, row, tile);
      }
    }
  }

  private drawTile(column: number, row: number, tile: Tile): void {
    const context = this.context;
    const x = column * TILE_SIZE;
    const y = row * TILE_SIZE;

    switch (tile) {
      case Tile.Brick: {
        context.fillStyle = "#9e3f2f";
        context.fillRect(x, y, TILE_SIZE, TILE_SIZE);

        context.strokeStyle = "#4e1b16";
        context.lineWidth = 2;

        context.strokeRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);

        context.beginPath();
        context.moveTo(x, y + TILE_SIZE / 2);
        context.lineTo(x + TILE_SIZE, y + TILE_SIZE / 2);

        context.moveTo(x + TILE_SIZE / 2, y);
        context.lineTo(x + TILE_SIZE / 2, y + TILE_SIZE / 2);

        context.moveTo(x + TILE_SIZE / 4, y + TILE_SIZE / 2);
        context.lineTo(x + TILE_SIZE / 4, y + TILE_SIZE);

        context.moveTo(x + (TILE_SIZE * 3) / 4, y + TILE_SIZE / 2);
        context.lineTo(x + (TILE_SIZE * 3) / 4, y + TILE_SIZE);

        context.stroke();
        break;
      }

      case Tile.Steel: {
        const gradient = context.createLinearGradient(
          x,
          y,
          x + TILE_SIZE,
          y + TILE_SIZE,
        );

        gradient.addColorStop(0, "#f0f3f6");
        gradient.addColorStop(0.5, "#727985");
        gradient.addColorStop(1, "#d4d8df");

        context.fillStyle = gradient;
        context.fillRect(x, y, TILE_SIZE, TILE_SIZE);

        context.strokeStyle = "#363b43";
        context.lineWidth = 2;
        context.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);

        context.fillStyle = "#30343b";

        for (const [offsetX, offsetY] of [
          [6, 6],
          [26, 6],
          [6, 26],
          [26, 26],
        ]) {
          context.beginPath();
          context.arc(x + offsetX, y + offsetY, 2, 0, Math.PI * 2);
          context.fill();
        }

        break;
      }

      case Tile.Water: {
        context.fillStyle = "#1859a9";
        context.fillRect(x, y, TILE_SIZE, TILE_SIZE);

        context.strokeStyle = "#55b8ff";
        context.lineWidth = 2;

        for (let offset = 6; offset < TILE_SIZE; offset += 9) {
          context.beginPath();

          for (let waveX = 0; waveX <= TILE_SIZE; waveX += 4) {
            const waveY =
              y + offset + Math.sin((waveX + performance.now() / 100) * 0.4) * 2;

            if (waveX === 0) {
              context.moveTo(x + waveX, waveY);
            } else {
              context.lineTo(x + waveX, waveY);
            }
          }

          context.stroke();
        }

        break;
      }

      case Tile.Bush: {
        context.fillStyle = "rgba(29, 100, 39, 0.92)";
        context.fillRect(x, y, TILE_SIZE, TILE_SIZE);

        const bushColors = ["#256b34", "#348443", "#164b27"];

        for (let index = 0; index < 12; index += 1) {
          const offsetX = pseudoRandom(column, row, index) * TILE_SIZE;
          const offsetY = pseudoRandom(row, index, column) * TILE_SIZE;
          const radius = 4 + pseudoRandom(index, column, row) * 6;

          context.fillStyle = bushColors[index % bushColors.length];
          context.beginPath();
          context.arc(x + offsetX, y + offsetY, radius, 0, Math.PI * 2);
          context.fill();
        }

        break;
      }

      default:
        break;
    }
  }

  private drawTank(tank: Tank): void {
    const context = this.context;

    if (
      tank.invulnerable > 0 &&
      Math.floor(tank.invulnerable * 10) % 2 === 0
    ) {
      context.save();
      context.globalAlpha = 0.45;
    } else {
      context.save();
    }

    const centerX = tank.x + tank.width / 2;
    const centerY = tank.y + tank.height / 2;

    context.translate(centerX, centerY);
    context.rotate(directionAngle(tank.direction));

    const x = -tank.width / 2;
    const y = -tank.height / 2;

    // Гусеницы.
    context.fillStyle = "#202020";
    context.fillRect(x, y, 6, tank.height);
    context.fillRect(x + tank.width - 6, y, 6, tank.height);

    context.fillStyle = "#555";

    for (let trackY = y + 2; trackY < y + tank.height; trackY += 7) {
      context.fillRect(x + 1, trackY, 4, 4);
      context.fillRect(x + tank.width - 5, trackY, 4, 4);
    }

    // Корпус.
    context.fillStyle = tank.color;
    context.fillRect(x + 6, y + 3, tank.width - 12, tank.height - 6);

    context.fillStyle = shadeColor(tank.color, -35);
    context.fillRect(x + 9, y + 7, tank.width - 18, tank.height - 12);

    // Башня.
    context.fillStyle = shadeColor(tank.color, 22);
    context.beginPath();
    context.arc(0, 0, 7, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = "#171717";
    context.lineWidth = 2;
    context.stroke();

    // Ствол направлен вверх до поворота контекста.
    context.fillStyle = "#202020";
    context.fillRect(-2, y - 5, 4, 16);

    context.fillStyle =
      tank.kind === "player" ? "#fff1a3" : "rgba(255, 255, 255, 0.8)";
    context.fillRect(-2, -2, 4, 4);

    context.restore();
  }

  private drawBullet(bullet: Bullet): void {
    const context = this.context;

    context.save();

    context.shadowColor = bullet.owner === "player" ? "#fff176" : "#ff7043";
    context.shadowBlur = 8;

    context.fillStyle =
      bullet.owner === "player" ? "#fff7c2" : "#ffb199";

    context.beginPath();
    context.arc(
      bullet.x,
      bullet.y,
      bullet.radius,
      0,
      Math.PI * 2,
    );
    context.fill();

    context.restore();
  }

  private drawBase(): void {
    const context = this.context;

    context.save();

    context.fillStyle = this.base.alive ? "#d1a241" : "#3d3d3d";
    context.fillRect(
      this.base.x + 5,
      this.base.y + 5,
      this.base.width - 10,
      this.base.height - 10,
    );

    context.strokeStyle = "#191919";
    context.lineWidth = 4;
    context.strokeRect(
      this.base.x + 5,
      this.base.y + 5,
      this.base.width - 10,
      this.base.height - 10,
    );

    const centerX = this.base.x + this.base.width / 2;
    const centerY = this.base.y + this.base.height / 2;

    context.translate(centerX, centerY);

    if (this.base.alive) {
      context.fillStyle = "#2b2111";

      context.beginPath();
      context.moveTo(0, -18);
      context.lineTo(8, -4);
      context.lineTo(19, -9);
      context.lineTo(11, 4);
      context.lineTo(18, 17);
      context.lineTo(0, 10);
      context.lineTo(-18, 17);
      context.lineTo(-11, 4);
      context.lineTo(-19, -9);
      context.lineTo(-8, -4);
      context.closePath();
      context.fill();
    } else {
      context.strokeStyle = "#111";
      context.lineWidth = 6;

      context.beginPath();
      context.moveTo(-18, -18);
      context.lineTo(18, 18);
      context.moveTo(18, -18);
      context.lineTo(-18, 18);
      context.stroke();
    }

    context.restore();
  }

  private win(): void {
    if (this.state !== "running") {
      return;
    }

    this.state = "won";
    this.showOverlay(
      "Победа!",
      `Все ${TOTAL_ENEMIES} танков уничтожены.<br>Счёт: ${this.score}`,
      "Играть снова",
    );
  }

  private lose(reason: string): void {
    if (this.state !== "running") {
      return;
    }

    this.state = "lost";
    this.showOverlay(
      "Игра окончена",
      `${reason}.<br>Счёт: ${this.score}`,
      "Начать заново",
    );
  }

  private togglePause(): void {
    if (this.state === "running") {
      this.state = "paused";
      this.showOverlay(
        "Пауза",
        "Нажмите P или кнопку ниже, чтобы продолжить.",
        "Продолжить",
      );
      this.updateHud();
      return;
    }

    if (this.state === "paused") {
      this.state = "running";
      this.lastTime = performance.now();
      this.hideOverlay();
      this.updateHud();
    }
  }

  private showOverlay(
    title: string,
    text: string,
    buttonText: string,
  ): void {
    overlayTitle.textContent = title;
    overlayText.innerHTML = text;
    startButton.textContent = buttonText;
    overlay.classList.remove("hidden");
  }

  private hideOverlay(): void {
    overlay.classList.add("hidden");
  }

  private updateHud(): void {
    scoreElement.textContent = String(this.score);
    livesElement.textContent = String(this.lives);

    const remainingEnemies = Math.max(
      0,
      TOTAL_ENEMIES - this.destroyedEnemies,
    );

    enemiesElement.textContent = String(remainingEnemies);

    const statuses: Record<GameState, string> = {
      menu: "Готов",
      running: "Бой",
      paused: "Пауза",
      won: "Победа",
      lost: "Поражение",
    };

    statusElement.textContent = statuses[this.state];
  }

  private isKeyDown(...codes: string[]): boolean {
    return codes.some((code) => this.keys.has(code));
  }

  private bindEvents(): void {
    window.addEventListener("keydown", (event) => {
      const controlledKeys = [
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "Space",
        "KeyW",
        "KeyA",
        "KeyS",
        "KeyD",
        "KeyP",
      ];

      if (controlledKeys.includes(event.code)) {
        event.preventDefault();
      }

      if (event.code === "KeyP" && !event.repeat) {
        this.togglePause();
        return;
      }

      this.keys.add(event.code);
    });

    window.addEventListener("keyup", (event) => {
      this.keys.delete(event.code);
    });

    window.addEventListener("blur", () => {
      this.keys.clear();
    });

    startButton.addEventListener("click", () => {
      if (this.state === "paused") {
        this.togglePause();
      } else {
        this.start();
      }
    });

    const controls =
      document.querySelectorAll<HTMLButtonElement>("[data-key]");

    for (const control of controls) {
      const code = control.dataset.key;

      if (!code) {
        continue;
      }

      const press = (event: PointerEvent): void => {
        event.preventDefault();

        control.setPointerCapture(event.pointerId);
        control.classList.add("active");
        this.keys.add(code);
      };

      const release = (event: PointerEvent): void => {
        event.preventDefault();

        control.classList.remove("active");
        this.keys.delete(code);
      };

      control.addEventListener("pointerdown", press);
      control.addEventListener("pointerup", release);
      control.addEventListener("pointercancel", release);
      control.addEventListener("lostpointercapture", () => {
        control.classList.remove("active");
        this.keys.delete(code);
      });
    }
  }
}

function rectanglesOverlap(
  first: Rectangle,
  second: Rectangle,
): boolean {
  return (
    first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y
  );
}

function directionAngle(direction: Direction): number {
  switch (direction) {
    case "right":
      return Math.PI / 2;

    case "down":
      return Math.PI;

    case "left":
      return -Math.PI / 2;

    case "up":
    default:
      return 0;
  }
}

function distanceBetween(
  firstX: number,
  firstY: number,
  secondX: number,
  secondY: number,
): number {
  return Math.hypot(secondX - firstX, secondY - firstY);
}

function pseudoRandom(
  first: number,
  second: number,
  third: number,
): number {
  const value = Math.sin(
    first * 12.9898 + second * 78.233 + third * 37.719,
  ) * 43758.5453;

  return value - Math.floor(value);
}

function shadeColor(color: string, amount: number): string {
  const normalized = color.replace("#", "");

  const red = clamp(
    Number.parseInt(normalized.slice(0, 2), 16) + amount,
    0,
    255,
  );

  const green = clamp(
    Number.parseInt(normalized.slice(2, 4), 16) + amount,
    0,
    255,
  );

  const blue = clamp(
    Number.parseInt(normalized.slice(4, 6), 16) + amount,
    0,
    255,
  );

  return `rgb(${red}, ${green}, ${blue})`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

new BattleCityGame(canvas);
