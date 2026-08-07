global.window = global;
const listeners = {};

global.window.addEventListener = (name, fn) => { listeners[name] = fn; };
global.window.removeEventListener = () => {};

global.document = {
  getElementById: () => ({
    classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
    focus: () => {},
    setAttribute: () => {},
    getAttribute: () => null,
    appendChild: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    closest: () => null,
    style: {},
    innerHTML: '',
    textContent: '',
    value: '',
    href: '',
    src: '',
    disabled: false,
  }),
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => ({
    getContext: () => null,
    appendChild: () => {},
    setAttribute: () => {},
    addEventListener: () => {},
    style: {},
    src: '',
    href: '',
    innerHTML: '',
    textContent: '',
    value: '',
    focus: () => {},
    classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
    querySelector: () => null,
    querySelectorAll: () => [],
  }),
  body: {},
};
global.navigator = {
  geolocation: {
    getCurrentPosition: (success, error) => {},
  },
  standalone: false,
  clipboard: { writeText: async () => {} },
};
global.location = { href: 'http://localhost' };
global.console = console;
global.alert = () => {};
global.matchMedia = () => ({ matches: false, addListener: () => {}, removeListener: () => {} });

global.navigator.language = 'zh-TW';
global.navigator.userAgent = 'node';

global.window = global;

try {
  require('./tmp_sanitized.js');
  console.log('EXECUTED OK');
} catch (e) {
  console.error('EXEC ERROR', e.message);
  console.error(e.stack);
  process.exit(1);
}
