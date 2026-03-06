/**
 * Dispatcher alias for notify-alert.
 *
 * Root cause fixed:
 * routes.json pointed system.error -> notify-alert,
 * but dispatcher only searched infrastructure/dispatcher/handlers and
 * infrastructure/event-bus/handlers. The dispatcher directory lacked
 * notify-alert.js, so route matched while handler execution silently no-op'd.
 */

module.exports = require('../../event-bus/handlers/notify-alert');
