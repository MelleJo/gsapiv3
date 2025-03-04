export default function Header() {
    return (
      <header className="w-full py-6 bg-gradient">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center text-center">
            <h1 className="text-3xl font-bold mb-2 text-white">Meeting Summarizer</h1>
            <p className="text-blue-100">
              Transcribe and summarize your meetings with AI
            </p>
          </div>
        </div>
      </header>
    );
  }