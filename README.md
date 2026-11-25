# VoltGrid

Програма для проєктування електромереж і розрахунку матеріалів у багатоповерхових новобудовах. Базовий регіон — Польща, архітектура розрахована на додавання інших країн.

Повний опис вимог: [`docs/TZ.md`](docs/TZ.md).

## Структура

- `packages/core` — модель проєкту, (далі) трасування та розрахунки; без UI
- `packages/regions` — регіональні профілі норм (JSON + валідація схеми)
- `apps/web` — веб-редактор (React + Vite)

## Швидкий старт

Потрібні Node.js 20+ і [pnpm](https://pnpm.io/).

```bash
pnpm install
pnpm test        # юніт-тести
pnpm typecheck   # перевірка типів
pnpm dev         # запуск редактора на localhost
```

## Примітка про норми

Регіональний профіль `pl` має статус `draft`: значення в ньому — стартові заготовки й потребують звірки з чинними нормативними документами. Програма — допоміжний інструмент і не замінює проєкт, виконаний особою з відповідними повноваженнями.

## Збірка настільної версії

Оболонка — Electron (`apps/desktop`). Локально:

```bash
pnpm install
pnpm desktop:start                      # запуск у вікні Electron
pnpm --filter @voltgrid/web build
pnpm --filter @voltgrid/desktop dist:linux   # AppImage + deb → apps/desktop/release
pnpm --filter @voltgrid/desktop dist:win     # NSIS-інсталятор + portable (краще збирати на Windows)
```

У GitHub: **Actions → «Збірка VoltGrid (вручну)» → Run workflow**, обрати `windows`, `linux` або `both`.
Готові файли з'являються в розділі Artifacts запуску (зберігаються 14 днів).
