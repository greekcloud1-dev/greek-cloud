const website = "https://www.greekcloud.co.il";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <a
          className="brand"
          href={website}
          aria-label="GreekCloud — לאתר הראשי"
        >
          <span className="brand-mark" aria-hidden="true">
            GC
          </span>
          <span className="brand-copy">
            <strong dir="ltr">GreekCloud</strong>
            <small>ליווי ותיאום בעברית</small>
          </span>
        </a>
        <a href={website}>בחזרה לאתר</a>
      </div>
    </header>
  );
}
