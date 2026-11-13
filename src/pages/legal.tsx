import type { ReactNode } from "react";
import { Link } from "react-router";
import { BrandLogo } from "@/components/shared/brand";
import { ThemeToggle } from "@/components/theme/theme-toggle";

const LAST_UPDATED = "13 November 2026";

function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5 sm:px-8">
        <Link to="/" aria-label="AgencyOS home" className="rounded-lg">
          <BrandLogo />
        </Link>
        <ThemeToggle />
      </header>
      <main className="mx-auto max-w-3xl px-5 pt-6 pb-24 sm:px-8">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
        <div className="mt-10 space-y-8 text-[15px] leading-relaxed text-foreground/90 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_p+p]:mt-3 [&_ul]:space-y-1.5">
          {children}
        </div>
        <footer className="mt-14 flex gap-5 border-t pt-6 text-sm text-muted-foreground">
          <Link to="/privacy" className="hover:text-foreground">
            Privacy Policy
          </Link>
          <Link to="/terms" className="hover:text-foreground">
            Terms of Service
          </Link>
          <Link to="/" className="hover:text-foreground">
            Home
          </Link>
        </footer>
      </main>
    </div>
  );
}

const CONTACT = "the support email shown on the AgencyOS Google sign-in screen";

export function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy">
      <section>
        <p>
          AgencyOS is a workspace for agencies, freelancers and service providers to manage projects, team members, invoices and
          contracts. This policy explains what information we collect, why, and the choices you have.
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
          AgencyOS requests only your basic Google profile (name, email address and profile picture) and uses it solely to create and
          identify your account. Our use of information received from Google APIs adheres to the Google API Services User Data Policy,
          including the Limited Use requirements. We do not transfer this data to others except as needed to run the service, and we
          do not use it to train AI models.
        </p>
      </section>

      <section>
        <h2>Cookies</h2>
        <p>
          We use one essential cookie to keep you signed in, plus short-lived cookies during Google sign-in. Your theme and sidebar
          preferences are kept in your browser's local storage. We do not use advertising or third-party tracking cookies.
        </p>
      </section>

      <section>
        <h2>Where data is stored and who processes it</h2>
        <ul>
          <li>Cloudflare – application hosting, file storage and network security.</li>
          <li>Supabase – the database (hosted in Mumbai, India).</li>
          <li>Google – sign-in.</li>
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
          These terms govern your use of AgencyOS. By creating an account or using the service you agree to them. If you use AgencyOS on
          behalf of a business, you agree on that business's behalf.
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
          The content you add to AgencyOS remains yours. You give us permission to store and process it only as needed to operate the
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
          AgencyOS provides tools to create documents and collect signatures; it does not provide legal, tax or accounting advice. You
          are responsible for making sure your documents and tax calculations meet the requirements that apply to you.
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
          To the extent permitted by law, AgencyOS is not liable for indirect or consequential losses, or for loss of profits, revenue or
          data arising from use of the service.
        </p>
      </section>

      <section>
        <h2>Ending use</h2>
        <p>You may stop using AgencyOS at any time, and a workspace owner may delete their workspace. See the Privacy Policy for what happens to data.</p>
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
