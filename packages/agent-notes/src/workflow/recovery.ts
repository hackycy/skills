// Composition root: serialized kinds select fixed trusted code, never scripts
// named by a journal. The filesystem transaction itself knows no host paths.
import type { Snapshot } from '../notes/snapshot'
import { validateJournal } from '../distribution/transition'
import { recoverTransaction as recover, recoveryView as view } from './transaction'

export const recoverTransaction = (root: string): boolean => recover(root, validateJournal)
export const recoveryView = (source: Snapshot): ReturnType<typeof view> => view(source, validateJournal)
