// InsumoSync: Root Page Redirector
// Author: frontend-engineer
import { redirect } from 'next/navigation';

export default function HomePage() {
  redirect('/estoque');
}
