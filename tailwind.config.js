/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  // Scope all Tailwind styles to the chatbot container to prevent conflicts with Webflow
  important: '#techjays-chatbot',
  theme: {
    extend: {},
  },
  plugins: [],
}

