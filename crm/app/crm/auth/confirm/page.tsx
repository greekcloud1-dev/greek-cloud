import { acceptAccountLink } from "@/app/crm/account/actions";
import styles from "@/app/crm/login/login.module.css";

// A deliberate POST prevents email scanners from consuming the one-time token.
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string }>;
}) {
  const query = await searchParams;
  return (
    <main>
      <section
        className={styles.setupPanel}
        style={{ maxWidth: 500, margin: "40px auto" }}
      >
        <h1>המשך להגדרת החשבון</h1>
        <p>הקישור מיועד למשתמש הצוות שקיבל את ההודעה.</p>
        <form action={acceptAccountLink}>
          <input type="hidden" name="token" value={query.token_hash ?? ""} />
          <input type="hidden" name="type" value={query.type ?? ""} />
          <button className={styles.primaryAction} type="submit">
            המשך לבחירת סיסמה
          </button>
        </form>
      </section>
    </main>
  );
}
