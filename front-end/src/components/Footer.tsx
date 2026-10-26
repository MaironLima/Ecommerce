import { Link } from "react-router-dom";
import { Github, Mail } from "lucide-react";

const GITHUB_URL = "https://github.com/MaironLima";

const link = "opacity-80 hover:opacity-100 transition-opacity";

function Footer() {
  return (
    <footer className="w-full bg-primary text-primary-foreground">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 px-4 py-4 text-xs sm:flex-row sm:justify-between sm:px-6">
        <p className="opacity-70">© {new Date().getFullYear()} My Store · Portfolio project by Mairon Lima</p>

        <nav aria-label="Policies" className="flex flex-wrap justify-center gap-x-4 gap-y-1">
          <Link to="/privacy" className={link}>Privacy</Link>
          <Link to="/terms" className={link}>Terms</Link>
          <Link to="/returns" className={link}>Returns</Link>
        </nav>

        <div className="flex items-center gap-3">
          <a href="mailto:maironlmelo@gmail.com" aria-label="E-mail" className={link}>
            <Mail size={16} />
          </a>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" aria-label="GitHub" className={link}>
            <Github size={16} />
          </a>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
