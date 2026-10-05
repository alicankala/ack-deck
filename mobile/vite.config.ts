import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// Shared forms live outside this package. Resolve their hooks/JSX through the
// same React instance as the mobile renderer, despite separate node_modules.
export default defineConfig({plugins:[react()],resolve:{dedupe:['react','react-dom']},server:{proxy:{'/api':'http://127.0.0.1:8787'}}});
