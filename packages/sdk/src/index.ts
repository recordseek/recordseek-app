import { install } from './core';

try {
  install();
} catch {
  // never throw into the host page
}
