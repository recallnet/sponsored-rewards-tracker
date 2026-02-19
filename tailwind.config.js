/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#000000',
        surface: '#000000',
        'surface-hover': '#111111',
        border: '#333333',
        'text-primary': '#ffffff',
        'text-secondary': '#999999',
        'text-muted': '#555555',
        accent: '#ffffff',
        'accent-dim': '#cccccc',
        profit: '#ffffff',
        loss: '#999999',
        warning: '#ffffff',
      },
      fontFamily: {
        sans: ['"Replica LL"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '0px',
        lg: '0px',
        md: '0px',
        sm: '0px',
        full: '9999px',
      },
    },
  },
  plugins: [],
};
