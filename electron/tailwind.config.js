/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: '#FFFFFF',
        canvas: {
          DEFAULT: '#FFFFFF',
          subtle: '#F8FAFC',
          hover: '#F1F5F9',
          active: '#E2E8F0',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          secondary: '#F8FAFC',
          hover: '#F1F5F9',
          active: '#E2E8F0',
        },
        border: {
          DEFAULT: '#E2E8F0',
          strong: '#CBD5E1',
          subtle: '#F1F5F9',
          focus: '#3B82F6',
        },
        blue: {
          DEFAULT: '#2563EB',
          hover: '#1D4ED8',
          subtle: '#EFF6FF',
          border: '#BFDBFE',
          ring: 'rgba(37, 99, 235, 0.25)',
        },
        amber: {
          DEFAULT: '#2563EB',
          dim: '#1D4ED8',
          faint: 'rgba(37, 99, 235, 0.08)',
          glow: 'rgba(37, 99, 235, 0.25)',
        },
        carbon: {
          DEFAULT: '#0F172A',
          muted: '#64748B',
          faint: '#94A3B8',
        },
        status: {
          green: '#059669',
          blue: '#2563EB',
          red: '#DC2626',
          amber: '#D97706',
        }
      },
      fontFamily: {
        sans: ['Inter', 'IBM Plex Sans', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'IBM Plex Mono', 'Menlo', 'Monaco', 'Courier New', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '8px',
        lg: '10px',
        xl: '12px',
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)',
        elevated: '0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.05)',
      }
    },
  },
  plugins: [],
}
