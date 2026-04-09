// Mock chokidar for Jest tests (ESM module workaround)
const EventEmitter = require('events')

class MockFSWatcher extends EventEmitter {
  constructor(paths, options) {
    super()
    this.paths = paths
    this.options = options
    this.listeners = {}
  }

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = []
    }
    this.listeners[event].push(callback)
    return this
  }

  off(event, callback) {
    if (this.listeners[event]) {
      const index = this.listeners[event].indexOf(callback)
      if (index > -1) {
        this.listeners[event].splice(index, 1)
      }
    }
    return this
  }

  once(event, callback) {
    const wrappedCallback = (...args) => {
      callback(...args)
      this.off(event, wrappedCallback)
    }
    return this.on(event, wrappedCallback)
  }

  emitEvent(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(data))
    }
  }

  close() {
    this.listeners = {}
  }
}

module.exports = {
  watch: jest.fn((paths, options) => {
    const watcher = new MockFSWatcher(paths, options)
    
    // Expose methods to manually trigger events in tests
    watcher.mockEmitAdd = (path) => watcher.emitEvent('add', path)
    watcher.mockEmitChange = (path) => watcher.emitEvent('change', path)
    watcher.mockEmitUnlink = (path) => watcher.emitEvent('unlink', path)
    
    return watcher
  })
}
