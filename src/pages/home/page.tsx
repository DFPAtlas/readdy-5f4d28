import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div className="relative flex flex-col items-center justify-center h-screen text-center px-4">
      <Link
        to="/staff"
        className="text-lg font-medium text-foreground-950 hover:text-primary-500 transition-colors underline underline-offset-4"
      >
        Go to Staff Dashboard
      </Link>
    </div>
  );
}