import Phaser from 'phaser'

// Shared event bus for cross-module communication.
// Modules publish/subscribe here instead of importing each other directly.
const EventBus = new Phaser.Events.EventEmitter()

export default EventBus
