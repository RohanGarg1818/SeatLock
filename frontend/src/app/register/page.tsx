import { Suspense } from 'react';
import AuthForm from '@/components/AuthForm';
export const metadata = { title: 'Sign up' };
export default function Page() { return <Suspense><AuthForm mode="register" /></Suspense>; }
