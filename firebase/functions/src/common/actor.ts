/** Resolve an admin's display name from their adminUsers profile, for the
 *  "added by / approved by" attribution shown across the console. */
import { db } from './admin';
import { Collections } from './collections';

export async function adminName(uid: string): Promise<string> {
  try {
    const d = await db.collection(Collections.adminUsers).doc(uid).get();
    return (d.data()?.name as string | undefined) ?? '';
  } catch {
    return '';
  }
}
