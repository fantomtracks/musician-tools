function Footer() {
  // From package.json via Vite's define (vite.config.ts). The typeof guard keeps
  // it safe under Jest, where the build-time constant isn't defined.
  const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

  return (
    <footer className="bg-gradient-to-t from-gray-900 to-gray-800 dark:from-gray-950 dark:to-gray-900 text-white border-t border-gray-700 dark:border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-xl">♪</span>
            </div>
            <div className="text-left">
              <div className="text-lg font-semibold">Musician Tools</div>
              <div className="text-xs text-gray-400">Practice with intention</div>
            </div>
          </div>

          <p className="text-sm text-gray-400 max-w-md">
            Track your songs, instruments, and progress in one clean workspace.
          </p>

          <div className="divider-line border-gray-700 w-full max-w-xs" />

          <div className="flex flex-col sm:flex-row items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
            <span>v{appVersion}</span>
            <span className="hidden sm:inline">•</span>
            <span className="inline-flex items-center gap-1 flex-wrap justify-center">
              <span>Made with ❤️ by</span>
              <a
                href="https://github.com/northwood-dev"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-brand-400 hover:text-brand-300 underline-offset-2 hover:underline transition-colors whitespace-nowrap"
              >
                northwood.dev
              </a>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
