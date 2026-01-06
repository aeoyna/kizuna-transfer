import P2PConnection from "./components/P2PConnection";

export default function Home() {
  return (
    <main className="min-h-screen w-full flex flex-col">
      <P2PConnection />

      <footer className="fixed bottom-4 w-full text-center text-gray-700 text-xs pointer-events-none">
        <p>© 2026 Kizuna Project</p>
      </footer>
    </main>
  );
}
