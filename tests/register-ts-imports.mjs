import { registerHooks } from 'node:module'
import { extname } from 'node:path'

// Resolve bundler-style relative TS imports in Node's native TypeScript test runner.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try { return nextResolve(specifier, context) } catch (error) {
      if (error.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && !extname(specifier)) {
        return nextResolve(`${specifier}.ts`, context)
      }
      throw error
    }
  },
})
