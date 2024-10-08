// app/providers.tsx
'use client';

import { NextUIProvider } from '@nextui-org/react';

export default function Providers({ children }: { children: React.ReactNode }) {
    return (
        <NextUIProvider className="flex flex-col min-h-screen">
            {children}
        </NextUIProvider>
    );
}
