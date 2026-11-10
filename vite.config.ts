import {defineConfig} from 'vite';

// Saved runs and archived checkouts are evidence, never live application sources.
export default defineConfig({server:{watch:{ignored:['**/reports/**']}}});
