import P2PConnection from "../components/P2PConnection";

export default async function TransferPage({ params }: { params: Promise<{ k: string }> }) {
    const { k } = await params;

    return (
        <main className="w-full flex-grow flex flex-col">
            <P2PConnection initialKey={k} />
        </main>
    );
}
