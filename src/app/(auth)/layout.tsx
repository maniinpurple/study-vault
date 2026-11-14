/** Sign-in and registration: a single quiet column on the page background, no sidebar. */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return <main className="grid min-h-dvh place-items-center px-5 py-12">{children}</main>;
}
