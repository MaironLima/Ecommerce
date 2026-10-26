import { Link } from "react-router-dom";
import UniversalBreadcrum from "@/components/UniversalBreadcrum";

const UPDATED = "October 26, 2026";

function LegalLayout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col bg-background">
      <div className="mx-auto w-full max-w-3xl px-4 pt-4 sm:px-6">
        <UniversalBreadcrum labels={[{ label: "Products", to: "/" }, title]} />
      </div>
      <article className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pb-10 pt-4 sm:px-6">
        <header>
          <h1 className="global-title text-2xl sm:text-3xl">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Last updated: {UPDATED}</p>
        </header>
        {children}
      </article>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 text-sm leading-relaxed text-foreground/90">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

const list = "list-disc space-y-1 pl-5";

export function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy">
      <p className="text-sm text-muted-foreground">
        This store is a portfolio project. It follows the Brazilian General Data Protection Law (LGPD, Law 13.709/2018) and
        collects only what it needs to run your account and orders.
      </p>

      <Section title="1. Data we collect">
        <ul className={list}>
          <li><strong>Account:</strong> name, e-mail and your password (stored only as a one-way hash).</li>
          <li><strong>Shipping:</strong> the addresses you save, and a copy of the chosen address on each order.</li>
          <li><strong>Orders and reviews:</strong> items, amounts, order status and the reviews you write.</li>
          <li><strong>Returns:</strong> the items, reason and optional comment of each return request, kept with the order.</li>
          <li><strong>Payments:</strong> handled by Stripe. Card data goes straight to Stripe and never touches our servers.</li>
          <li><strong>Technical records:</strong> date, time, IP address and requested page, needed for security.</li>
        </ul>
      </Section>

      <Section title="2. Why we use it (legal basis)">
        <ul className={list}>
          <li>To create your account, process orders and deliver them — performance of a contract (LGPD art. 7, V).</li>
          <li>To keep the store secure and investigate abuse — legitimate interest (art. 7, IX).</li>
          <li>To keep access records for 6 months — legal obligation under the Marco Civil da Internet, art. 15 (art. 7, II).</li>
        </ul>
        <p>We do not sell your data and do not use it for advertising profiles.</p>
      </Section>

      <Section title="3. Logs and minimization">
        <p>
          Application logs never contain passwords, tokens, card data or addresses. E-mails are masked (for example
          <code className="mx-1 rounded bg-muted px-1">j***@store.com</code>), user ids are replaced by a pseudonym and IP
          addresses are truncated. Only the access log keeps the full IP, as the law requires, and only a super administrator
          can read it — every read is recorded.
        </p>
      </Section>

      <Section title="4. How long we keep it">
        <ul className={list}>
          <li>Account, addresses and orders: while your account exists, and order records as long as tax law requires.</li>
          <li>Application logs: 90 days. Access logs: 6 months.</li>
        </ul>
      </Section>

      <Section title="5. Who we share it with">
        <p>
          Stripe (payments) and our e-mail provider (verification codes and order notices), only to provide the service.
        </p>
      </Section>

      <Section title="6. Your rights">
        <p>
          Under LGPD art. 18 you can ask to confirm, access, correct, delete or port your data, and to withdraw consent. You can
          edit your name and addresses in your <Link to="/profile?tab=account" className="text-primary hover:underline">profile</Link>.
          For anything else, write to <a href="mailto:support@store.com" className="text-primary hover:underline">support@store.com</a>.
        </p>
      </Section>

      <Section title="7. Cookies">
        <p>We use a single session cookie to keep you signed in. No advertising or tracking cookies.</p>
      </Section>
    </LegalLayout>
  );
}

export function TermsPage() {
  return (
    <LegalLayout title="Terms & Conditions">
      <p className="text-sm text-muted-foreground">
        By using this store you agree to these terms. This is a portfolio project: payments run in Stripe test mode and no
        real goods are shipped.
      </p>

      <Section title="1. Your account">
        <ul className={list}>
          <li>You must give a valid e-mail and keep your password safe. Password changes are confirmed by e-mail.</li>
          <li>You are responsible for activity on your account. We may suspend accounts used for fraud or abuse.</li>
        </ul>
      </Section>

      <Section title="2. Products and prices">
        <p>
          We try to keep descriptions, stock and prices accurate. If a price is clearly wrong we may cancel the order and refund
          any amount paid. Prices are shown in US dollars.
        </p>
      </Section>

      <Section title="3. Orders and payment">
        <ul className={list}>
          <li>An order is confirmed only after the payment is approved by Stripe.</li>
          <li>Items in your cart are reserved for a limited time; unpaid orders may be cancelled automatically.</li>
        </ul>
      </Section>

      <Section title="4. Returns and refunds">
        <p>
          Under the Brazilian Consumer Defense Code (art. 49), online purchases can be cancelled within 7 days of delivery.
          You can request a return from your orders. See the{" "}
          <Link to="/returns" className="text-primary hover:underline">Returns &amp; Refunds policy</Link>.
        </p>
      </Section>

      <Section title="5. Reviews">
        <p>
          Only customers who bought a product can review it. Reviews are moderated and may be removed if they are offensive,
          off-topic or contain personal data.
        </p>
      </Section>

      <Section title="6. Liability">
        <p>
          The store is provided as is. We are not liable for indirect damages or for outages of third-party services such as
          payment or e-mail providers, within the limits of the law.
        </p>
      </Section>

      <Section title="7. Privacy and law">
        <p>
          How we handle your data is described in the <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
          These terms are governed by Brazilian law.
        </p>
      </Section>
    </LegalLayout>
  );
}

export function ReturnsPolicyPage() {
  return (
    <LegalLayout title="Returns & Refunds">
      <p className="text-sm text-muted-foreground">
        Under the Brazilian Consumer Defense Code (art. 49) you can return an online purchase within 7 days, for any reason.
      </p>

      <Section title="1. How to request a return">
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            Open <Link to="/profile?tab=orders" className="text-primary hover:underline">My orders</Link> and click{" "}
            <strong>Request return</strong> on the order. The button shows the last day you can ask.
          </li>
          <li>Choose the items and how many units, the reason and, if you want, a short comment.</li>
          <li>You can cancel the request while it is still waiting for review.</li>
        </ol>
      </Section>

      <Section title="2. What happens next">
        <ul className={list}>
          <li><strong>Approved:</strong> we let you know and you send the items back.</li>
          <li><strong>Received:</strong> we check the items when they arrive.</li>
          <li><strong>Refunded:</strong> the amount goes back to the card you paid with.</li>
          <li><strong>Rejected:</strong> we tell you why in your orders and notifications.</li>
        </ul>
        <p>You can return part of an order. You get a notification at every step.</p>
      </Section>

      <Section title="3. Refunds">
        <p>
          Refunds are made through Stripe to the original card, for the price you paid for the returned units. Your bank usually
          shows the credit within 5 to 10 business days. Store credit and exchanges are not offered for now.
        </p>
      </Section>

      <Section title="4. Your data">
        <p>
          The comment you write is seen only by our team to review the request and is never copied to logs. See the{" "}
          <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
        </p>
      </Section>
    </LegalLayout>
  );
}
