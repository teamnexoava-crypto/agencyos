import type { ReactNode } from "react";
import { Link } from "react-router";
import { BUSINESS, SUPPORT_WHATSAPP, SUPPORT_WHATSAPP_DISPLAY } from "@shared/constants";
import { TRIAL_DAYS } from "@shared/plans";
import { BrandLogo } from "@/components/shared/brand";
import { WhatsAppSupportButton } from "@/components/shared/whatsapp-button";
import { ThemeToggle } from "@/components/theme/theme-toggle";

const LAST_UPDATED = "15 November 2026";

function LegalLayout({ title, children, dated = true }: { title: string; children: ReactNode; dated?: boolean }) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5 sm:px-8">
        <Link to="/" aria-label="GrowUpliftOS home" className="rounded-lg">
          <BrandLogo />
        </Link>
        <ThemeToggle />
      </header>
      <main className="mx-auto max-w-3xl px-5 pt-6 pb-24 sm:px-8">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        {dated && <p className="mt-2 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>}
        <div className="mt-10 space-y-8 text-[15px] leading-relaxed text-foreground/90 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_p+p]:mt-3 [&_p+ul]:mt-3 [&_ul]:space-y-1.5 [&_ul+p]:mt-3">
          {children}
        </div>
        <footer className="mt-14 flex flex-wrap gap-x-5 gap-y-2 border-t pt-6 text-sm text-muted-foreground">
          {(
            [
              ["/", "Home"],
              ["/about", "About"],
              ["/contact", "Contact"],
              ["/privacy", "Privacy Policy"],
              ["/terms", "Terms of Service"],
              ["/refunds", "Cancellation & Refunds"],
            ] as const
          ).map(([to, label]) => (
            <Link key={to} to={to} className="hover:text-foreground">
              {label}
            </Link>
          ))}
        </footer>
      </main>
      <WhatsAppSupportButton />
    </div>
  );
}

const CONTACT = `${BUSINESS.email}, or WhatsApp ${SUPPORT_WHATSAPP_DISPLAY} (wa.me/${SUPPORT_WHATSAPP}). Postal address: ${BUSINESS.name}, ${BUSINESS.address}`;

/** The business details block shown on the Contact and About pages. */
function BusinessDetails() {
  return (
    <dl className="grid gap-4 rounded-2xl border bg-card p-6 text-[15px] shadow-soft sm:grid-cols-[10rem_1fr] sm:gap-x-6 [&_dd]:text-foreground [&_dt]:text-sm [&_dt]:text-muted-foreground">
      <dt>Business name</dt>
      <dd className="-mt-3 font-medium sm:mt-0">{BUSINESS.name}</dd>
      <dt>Address</dt>
      <dd className="-mt-3 sm:mt-0">{BUSINESS.address}</dd>
      <dt>Email</dt>
      <dd className="-mt-3 sm:mt-0">
        <a href={`mailto:${BUSINESS.email}`} className="font-medium text-primary underline-offset-2 hover:underline">
          {BUSINESS.email}
        </a>
      </dd>
      <dt>Phone / WhatsApp</dt>
      <dd className="-mt-3 sm:mt-0">
        <a href={`https://wa.me/${SUPPORT_WHATSAPP}`} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline-offset-2 hover:underline">
          {SUPPORT_WHATSAPP_DISPLAY}
        </a>
      </dd>
      <dt>Website</dt>
      <dd className="-mt-3 sm:mt-0">{BUSINESS.website}</dd>
    </dl>
  );
}

export function ContactPage() {
  return (
    <LegalLayout title="Contact us" dated={false}>
      <section>
        <p>Questions about GrowUpliftOS, your plan, a payment or your data? We're happy to help. WhatsApp is the fastest way to reach us.</p>
        <p>
          <a href={`https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent("Hi, I need help with GrowUpliftOS.")}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-primary/90">
            Chat with us on WhatsApp
          </a>
        </p>
      </section>
      <section>
        <h2>Business details</h2>
        <BusinessDetails />
      </section>
      <section>
        <h2>Complaints and grievances</h2>
        <p>
          If something isn't right – a payment, a privacy concern or anything else – write to {BUSINESS.email} or message us on WhatsApp
          with your registered email address and a short description. We acknowledge every complaint within 48 hours and aim to resolve it
          within 30 days.
        </p>
      </section>
      <section>
        <h2>Billing questions</h2>
        <p>
          For cancellations and refunds, see our <Link to="/refunds" className="font-medium text-primary underline-offset-2 hover:underline">Cancellation &amp; Refund Policy</Link>. You can turn off
          auto-pay any time from Billing inside the app.
        </p>
      </section>
    </LegalLayout>
  );
}

export function AboutPage() {
  return (
    <LegalLayout title="About GrowUpliftOS" dated={false}>
      <section>
        <p>
          GrowUpliftOS is an all-in-one workspace for agencies, freelancers and service providers. It brings projects, tasks, clients,
          GST invoices with UPI, e-signed contracts, a client portal, a simple CRM and profit &amp; loss into one place – so small teams can
          spend their time on client work instead of juggling WhatsApp, Excel and Word.
        </p>
        <p>
          It is built in India, for the way Indian agencies actually work: invoices shared on WhatsApp and paid by UPI, clients who sign on
          their phones, and one flat price for the whole team. Agencies outside India can use it too, with prices in US dollars.
        </p>
      </section>
      <section>
        <h2>What you can do with it</h2>
        <ul>
          <li>Plan projects with milestones and tasks, and keep your team on the same page</li>
          <li>Send GST-ready invoices with a UPI QR code and track payments</li>
          <li>Get contracts signed online, with a full audit trail</li>
          <li>Give every client a private link to follow their project</li>
          <li>Track leads, expenses and profit by month, client and project</li>
        </ul>
      </section>
      <section>
        <h2>Plans</h2>
        <p>
          Every new workspace gets {TRIAL_DAYS} days of Premium free, then a Free plan for as long as you like. Paid plans are shown on our{" "}
          <Link to="/#pricing" className="font-medium text-primary underline-offset-2 hover:underline">pricing page</Link>.
        </p>
      </section>
      <section>
        <h2>Who we are</h2>
        <BusinessDetails />
      </section>
    </LegalLayout>
  );
}

export function RefundPage() {
  return (
    <LegalLayout title="Cancellation & Refund Policy">
      <section>
        <p>
          This policy applies to the paid plans of GrowUpliftOS (Growth and Premium), sold by {BUSINESS.name}. It is part of our{" "}
          <Link to="/terms" className="font-medium text-primary underline-offset-2 hover:underline">Terms of Service</Link>.
        </p>
      </section>
      <section>
        <h2>Free trial</h2>
        <p>
          Every new workspace gets the Premium plan free for {TRIAL_DAYS} days, with no card needed. Nothing is charged during or after the
          trial unless you choose a paid plan; if you don't, the workspace moves to the Free plan by itself.
        </p>
      </section>
      <section>
        <h2>Cancelling</h2>
        <ul>
          <li>
            <strong>Monthly plans with auto-pay</strong> can be cancelled any time from Billing inside the app{" "}
            (or, in India, from your UPI app or bank). No further payments are taken.
          </li>
          <li>
            <strong>Yearly plans and single months</strong> are one payment and never renew by themselves, so there is nothing to cancel.
          </li>
          <li>After cancelling, your plan stays active until the end of the period you have already paid for. Then the workspace moves to the Free plan; nothing is deleted.</li>
        </ul>
      </section>
      <section>
        <h2>Refunds</h2>
        <ul>
          <li>Because you can try every feature free for {TRIAL_DAYS} days first, payments for a period that has already started are not refunded, in full or in part.</li>
          <li>
            If you were charged twice, or charged after you had cancelled, tell us within 7 days of the charge. We will refund the extra
            amount to the original payment method.
          </li>
          <li>Approved refunds are processed within 5–7 working days; your bank or card issuer may take a few more days to show it.</li>
        </ul>
      </section>
      <section>
        <h2>How to ask for a refund</h2>
        <p>
          Write to {BUSINESS.email} or message us on WhatsApp at {SUPPORT_WHATSAPP_DISPLAY} with your registered email address, the date
          and amount of the payment, and what went wrong.
        </p>
      </section>
      <section>
        <h2>Delivery of the service</h2>
        <p>
          GrowUpliftOS is online software; nothing physical is shipped. Your plan is active as soon as the payment is confirmed, usually
          within a minute, and you use it in your browser at {BUSINESS.website}.
        </p>
      </section>
    </LegalLayout>
  );
}

export function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy">
      <section>
        <p>
          GrowUpliftOS is a workspace for agencies, freelancers and service providers to manage projects, team members, invoices and
          contracts, provided by {BUSINESS.name}, {BUSINESS.address}. This policy explains what information we collect, why, and the
          choices you have.
        </p>
      </section>

      <section>
        <h2>Information we collect</h2>
        <ul>
          <li>
            <strong>Google account details.</strong> When you sign in with Google we receive your name, email address, profile picture
            and Google account identifier. We never see or store your Google password.
          </li>
          <li>
            <strong>Workspace content.</strong> Information you and your team enter: agency details, clients, projects, tasks, invoices,
            payments, expenses, contracts, signatures, comments and uploaded files.
          </li>
          <li>
            <strong>Technical data.</strong> IP address and browser details, used to keep sessions secure, limit abuse and record the
            audit trail of an electronic signature.
          </li>
        </ul>
      </section>

      <section>
        <h2>How we use it</h2>
        <ul>
          <li>To provide the service: sign you in, show your workspace, generate invoices and contracts, and share the links you create.</li>
          <li>To protect accounts and prevent misuse.</li>
          <li>To respond when you contact us.</li>
        </ul>
        <p>We do not sell your information and we do not use it for advertising.</p>
      </section>

      <section>
        <h2>Google user data</h2>
        <p>
          GrowUpliftOS requests only your basic Google profile (name, email address and profile picture) and uses it solely to create and
          identify your account and to send you emails about your own workspace (a welcome, reminders before a trial or plan ends,
          and notices about failed payments) – never marketing from others. Our use of information received from Google APIs adheres to the Google API Services User Data Policy,
          including the Limited Use requirements. We do not transfer this data to others except as needed to run the service, and we
          do not use it to train AI models.
        </p>
      </section>

      <section>
        <h2>Cookies</h2>
        <p>
          We use one essential cookie to keep you signed in, plus short-lived cookies during Google sign-in. Your theme and sidebar
          preferences are kept in your browser's local storage. We do not use advertising or third-party tracking cookies. Page visits are counted with
          Cloudflare Web Analytics, which sets no cookies and does not identify you.
        </p>
      </section>

      <section>
        <h2>Where data is stored and who processes it</h2>
        <ul>
          <li>Cloudflare – application hosting, file storage and network security.</li>
          <li>Supabase – the database (hosted in Mumbai, India).</li>
          <li>Google – sign-in.</li>
          <li>Razorpay – payments for your plan in India. We never see or store your card, UPI or bank details.</li>
          <li>Resend – sends the app's emails to workspace owners (welcome, trial and plan reminders, payment notices).</li>
          <li>Dodo Payments – payments for your plan outside India. Dodo is the seller of record for those payments and handles any sales tax or VAT; we never see or store your card details.</li>
        </ul>
        <p>
          Anything you choose to share through a public link (an invoice, a contract or a project page) is visible to whoever has that
          link, until you disable or regenerate it.
        </p>
      </section>

      <section>
        <h2>Retention and deletion</h2>
        <p>
          We keep your information while your workspace exists. A workspace owner can delete the workspace, which removes its data. You
          can also ask us to delete your account or data by contacting us; we will act on verified requests within a reasonable time,
          except where the law requires us to keep certain records.
        </p>
      </section>

      <section>
        <h2>Your choices</h2>
        <p>
          You can ask for a copy of your data, ask us to correct or delete it, and withdraw Google access at any time from your Google
          Account's security settings.
        </p>
      </section>

      <section>
        <h2>Changes and contact</h2>
        <p>
          If this policy changes in a meaningful way we will update the date above and, where appropriate, notify workspace owners. For
          any privacy question or request, contact us at {CONTACT}.
        </p>
      </section>
    </LegalLayout>
  );
}

export function TermsPage() {
  return (
    <LegalLayout title="Terms of Service">
      <section>
        <p>
          These terms govern your use of GrowUpliftOS, a service provided by {BUSINESS.name}, {BUSINESS.address} ({BUSINESS.email}). By
          creating an account or using the service you agree to them. If you use GrowUpliftOS on behalf of a business, you agree on that
          business's behalf.
        </p>
      </section>

      <section>
        <h2>Your account</h2>
        <p>
          You sign in with a Google account and are responsible for activity under it. Workspace owners decide who is invited to their
          workspace and what role each person has.
        </p>
      </section>

      <section>
        <h2>Your content</h2>
        <p>
          The content you add to GrowUpliftOS remains yours. You give us permission to store and process it only as needed to operate the
          service for you. You are responsible for having the right to upload it and for the accuracy of documents you issue, such as
          invoices and contracts.
        </p>
      </section>

      <section>
        <h2>Acceptable use</h2>
        <ul>
          <li>Do not use the service for unlawful, fraudulent or abusive purposes.</li>
          <li>Do not attempt to access another workspace's data or to disrupt or probe the service.</li>
          <li>Do not upload malware or content you have no right to share.</li>
        </ul>
        <p>We may suspend accounts that break these rules.</p>
      </section>

      <section>
        <h2>Invoices, contracts and e-signatures</h2>
        <p>
          GrowUpliftOS provides tools to create documents and collect signatures; it does not provide legal, tax or accounting advice. You
          are responsible for making sure your documents and tax calculations meet the requirements that apply to you.
        </p>
      </section>

      <section id="plans">
        <h2>Free trial, plans and payments</h2>
        <p>
          Every new workspace gets the Premium plan free for {TRIAL_DAYS} days. After that it moves to the Free plan by itself and can
          stay there for as long as you like. The Free plan is for one person and has limits; team members, contracts, the client
          portal, finance and Google Sheet sync are part of the paid plans (Growth and Premium), which are charged in Indian rupees
          through Razorpay for workspaces created in India, and in US dollars through Dodo Payments (the seller of record, which
          adds no tax on top of the price shown) for workspaces created anywhere else. The currency is set when the workspace is
          created and shown on every price.
        </p>
        <ul>
          <li>
            <strong>Monthly plans renew automatically.</strong> You approve a mandate once (UPI AutoPay or a card) on Razorpay's page,
            and the plan's price is then collected every month until you turn auto-pay off. If you set it up during the trial, the
            first payment is taken when the trial ends. Razorpay or your bank tells you before each payment, as the rules for
            recurring payments require.
          </li>
          <li>
            <strong>Yearly plans, and single months, are one payment.</strong> Nothing renews or is collected by itself; the plan runs
            until the date shown on your Billing page.
          </li>
        </ul>
        <p>
          If a payment fails, Razorpay retries it for a few days and the plan stays as it is meanwhile. When a trial or a paid plan
          ends, the workspace moves to the Free plan: nothing is deleted, but what the Free plan does not include is switched off
          until you upgrade – team members cannot sign in to the workspace, client portal links are paused, and new contracts and
          expenses cannot be added. Invoice and contract links you already shared keep working. Prices and plan limits are shown on the pricing page and may change
          for future periods; the amount of an auto-pay mandate you have approved never changes without a new approval from you.
        </p>
      </section>

      <section id="refunds">
        <h2>Cancellations and refunds</h2>
        <p>
          You can turn off auto-pay at any time from Billing, or from your UPI app or bank. No further payments are taken, and the plan
          stays active until the end of the period already paid for. Because the free trial lets you try everything first, payments
          for a period that has started are not refunded. If you were charged twice or charged by mistake, write to us within 7 days
          and we will refund the extra amount to the original payment method, normally within 5–7 working days. The full details are in
          our <Link to="/refunds" className="font-medium text-primary underline-offset-2 hover:underline">Cancellation &amp; Refund Policy</Link>.
        </p>
      </section>

      <section>
        <h2>Availability and changes</h2>
        <p>
          We work to keep the service available and your data safe, but the service is provided "as is", without guarantees of
          uninterrupted availability. Features may change over time. Keep your own copies of important documents.
        </p>
      </section>

      <section>
        <h2>Liability</h2>
        <p>
          To the extent permitted by law, GrowUpliftOS is not liable for indirect or consequential losses, or for loss of profits, revenue or
          data arising from use of the service.
        </p>
      </section>

      <section>
        <h2>Ending use</h2>
        <p>You may stop using GrowUpliftOS at any time, and a workspace owner may delete their workspace. See the Privacy Policy for what happens to data.</p>
      </section>

      <section>
        <h2>Changes and contact</h2>
        <p>
          We may update these terms; the date above shows the latest version. Continued use after a change means you accept the updated
          terms. Questions? Contact us at {CONTACT}.
        </p>
      </section>
    </LegalLayout>
  );
}
