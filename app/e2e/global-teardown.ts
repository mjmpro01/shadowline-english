import { stopWorker } from './global-setup'

export default async function globalTeardown(): Promise<void> {
  stopWorker()
}
