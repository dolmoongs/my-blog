import { initTheme } from './theme.js';
import { startRouter } from './router.js';
import { showRoute } from './render.js';

initTheme(document.querySelector('.theme-toggle'));
startRouter(showRoute);
