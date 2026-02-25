import { redirect } from 'next/navigation';

export default function MessagesRedirectPage() {
  redirect('/dashboard/tasks');
}
