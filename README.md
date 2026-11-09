# Stemma

Angular app for mapping a family and getting a clear family tree drawn and printed for you.

![Angular](https://img.shields.io/badge/Angular-22-red) ![TypeScript](https://img.shields.io/badge/TypeScript-6-blue) ![Node.js](https://img.shields.io/badge/Node.js-22%2B-green) ![Deploy](https://img.shields.io/badge/Deploy-GitHub%20Pages-black)

**Live demo:** [firestone82.github.io/family-tree](https://firestone82.github.io/family-tree/)

## About

Stemma lets you add people and how they are related, and lays the chart out for you: it colours each family, names everyone's relationship to the person you centre on, and keeps line crossings to a minimum even for remarriages, divorces, adoptions or cousin marriages. Trees can be printed as posters in three styles and are saved as a versioned XML file that keeps working as the app changes. Everything runs in the browser and no data leaves your machine.

## Features

- Automatic layout for real families, with manual adjustments saved alongside the tree
- Relationship names to the centred person (great-aunt, sister-in-law, first cousin once removed, ...)
- Relationship status: married, engaged, partners, separated, divorced, widowed, annulled
- Twins and multiple births, people with unknown names, unknown parents
- Surnames that fill themselves in, including Czech female forms (Mikula -> Mikulova)
- Portraits, family colours on heraldic shields, light and dark mode
- Print studio with three styles - **Heirloom** (painted tree), **Heraldic** (roll of arms) and **Modern**
- Paper sizes A4 to A0, US Letter and Tabloid; export to printer, PDF, PNG or SVG
- Versioned XML format with schema ([schema/stemma-1.xsd](schema/stemma-1.xsd)) and autosave in the browser
- Undo/redo, keyboard navigation, English and Czech, mobile layout

## Requirements

- Node.js 22.22.3+ or 24.15+
- npm 10+

## Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/Firestone82/family-tree.git
   cd family-tree
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm start
   ```
   The app runs at `http://localhost:4200`. An example tree is in [samples/ashworth-family.xml](samples/ashworth-family.xml).

4. Build for production:
   ```bash
   npm run build
   ```
   The output in `dist/stemma/browser` is a static site that can be hosted anywhere.

Other scripts: `npm test` (Vitest), `npm run lint` (ESLint), `npm run format` (Prettier).

## License

Provided as-is for personal use.
