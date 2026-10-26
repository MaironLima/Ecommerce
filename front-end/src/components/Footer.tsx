import { Link } from "react-router-dom";
import { Github } from "lucide-react";

const GITHUB_URL = "https://github.com/MaironLima";

const heading = "mb-3 text-sm font-semibold uppercase tracking-wide";
const link = "opacity-90 hover:opacity-100 hover:underline underline-offset-4";

function Footer() {
  return (
    <footer className="w-full bg-primary text-primary-foreground">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
        <section>
          <h2 className={heading}>About us</h2>
          <p className="mb-3 text-sm opacity-90">A portfolio e-commerce project by Mairon Lima.</p>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className={"inline-flex items-center gap-2 text-sm " + link}>
            <Github size={16} /> GitHub
          </a>
        </section>

        <nav aria-label="Policies">
          <h2 className={heading}>Help</h2>
          <ul className="flex flex-col gap-2 text-sm">
            <li><Link to="/privacy" className={link}>Privacy Policy</Link></li>
            <li><Link to="/terms" className={link}>Terms &amp; Conditions</Link></li>
            <li><Link to="/returns" className={link}>Returns &amp; Refunds</Link></li>
          </ul>
        </nav>

        <section>
          <h2 className={heading}>Contact</h2>
          <ul className="flex flex-col gap-2 text-sm opacity-90">
            <li>Phone: (84) 90000-0000</li>
            <li>Email: <a href="mailto:support@store.com" className={link}>support@store.com</a></li>
            <li>Hours: 8 AM - 6 PM</li>
          </ul>
        </section>
      </div>
      <div className="border-t border-white/15 px-4 py-3 text-center text-xs opacity-70">
        © {new Date().getFullYear()} My Store — All rights reserved.
      </div>
    </footer>
  );
}

export default Footer;
