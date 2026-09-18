import Link from "next/link";
import Contact from "./contact";

export default function Home() {
  return (
    <div className="site-shell">
      <header className="site-header">
        <Link className="wordmark" href="/" aria-label="Yihan Wu home">yw<span>.</span></Link>
        <span className="location"><span className="location-dot" />New York, NY</span>
      </header>
      <main id="main-content">
        <section className="intro" aria-labelledby="intro-heading">
          <h1 id="intro-heading">Hello, I’m<br /><span>Yihan Wu.</span></h1>
          <p className="specialties">AI/ML systems. Software engineering.</p>
          <p className="bio">I’m a graduate student in Electrical Engineering at Columbia University, focused on AI engineering.</p>
          <div className="actions">
            <a className="button primary" href="/resume.pdf" target="_blank" rel="noopener noreferrer">View résumé <span aria-hidden="true">↗</span><span className="sr-only"> (PDF, opens in a new tab)</span></a>
            <Contact />
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <span>Yihan Wu</span>
        <span>A little introduction. A place to connect.</span>
      </footer>
    </div>
  );
}
