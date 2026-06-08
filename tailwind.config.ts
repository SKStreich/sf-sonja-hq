import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    // Entity color classes (ENTITY_TOGGLE_CLASS etc.) live here as string
    // literals — without scanning lib, Tailwind purges any color not also used
    // in app/components (e.g. bg-rose-600 for sfo, bg-cyan-600 for sfc), making
    // those chips render white-on-white when selected.
    './src/lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: { extend: {} },
  plugins: [require('@tailwindcss/typography')],
}
export default config
