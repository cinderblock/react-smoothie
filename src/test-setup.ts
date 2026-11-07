// bun test preload: provide a DOM (window, document, ...) via happy-dom
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register();

// Testing Library only sets this when test globals exist; bun:test's are imported, not global
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
