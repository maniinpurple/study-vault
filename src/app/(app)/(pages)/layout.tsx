/** Standard pages: a padded, centered column. The source workspace lives outside this group and fills the viewport. */
export default function PagesLayout({ children }: LayoutProps<"/">) {
  return <div className="vl-page mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">{children}</div>;
}
