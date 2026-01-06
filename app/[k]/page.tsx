import P2PConnection from "../components/P2PConnection";

export default async function TransferPage({ params }: { params: Promise<{ k: string }> }) {
    const { k } = await params;

    return (
        <main className="min-h-screen w-full flex flex-col">
            <P2PConnection initialKey={k} />

            <footer className="fixed bottom-4 w-full text-center text-gray-700 text-xs pointer-events-none">
                <p>© 2026 Kizuna Project</p>
            </footer>
        </main>
    );
}
