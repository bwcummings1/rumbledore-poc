import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1 className={styles.title}>Rumbledore</h1>
        <p className={styles.tagline}>
          Your fantasy league&apos;s home base — a decade of history, records,
          league news, AI takes, and paper betting. Connect your league once;
          everything else follows.
        </p>
      </main>
    </div>
  );
}
