export function SiteFooter() {
  return (
    <footer className="site-footer">
      <span>© {new Date().getFullYear()} GreekCloud</span>
      <a href="https://www.greekcloud.co.il/privacy.html">מדיניות פרטיות</a>
      <a href="https://www.greekcloud.co.il/terms.html">תנאי שימוש</a>
      <a href="https://www.greekcloud.co.il/accessibility.html">נגישות</a>
    </footer>
  );
}
