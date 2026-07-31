export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <main className="max-w-6xl mx-auto px-4 py-12">
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-black dark:text-white mb-2">
            Golden Lotus Labs Dashboard
          </h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            Business operations and analytics hub
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <a
            href="/login"
            className="block p-6 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-700 transition-colors"
          >
            <h2 className="text-xl font-semibold text-black dark:text-white mb-2">
              Dashboard Login
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400">
              Access your business metrics and analytics
            </p>
          </a>

          <a
            href="/apply"
            className="block p-6 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-700 transition-colors"
          >
            <h2 className="text-xl font-semibold text-black dark:text-white mb-2">
              Apply for Services
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400">
              Submit applications and order uploads
            </p>
          </a>
        </div>

        <div className="mt-12 p-6 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
          <h2 className="text-2xl font-semibold text-black dark:text-white mb-4">
            Features
          </h2>
          <ul className="space-y-2 text-zinc-700 dark:text-zinc-300">
            <li className="flex items-center gap-2">
              <span className="text-green-600">✓</span> Close pipeline integration
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-600">✓</span> Order upload management
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-600">✓</span> Claude screenshot extraction
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-600">✓</span> GA4 analytics tracking
            </li>
          </ul>
        </div>
      </main>
    </div>
  );
}
