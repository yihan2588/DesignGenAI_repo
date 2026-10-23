import { requireAdmin } from "@/lib/admin";
import { UploadForm } from "@/app/upload/upload-form";
export default async function New() {
  await requireAdmin();
  return (
    <>
      <p className="eyebrow">MEDIA LIBRARY / NEW ENTRY</p>
      <h1>Set the scene.</h1>
      <p>
        Your image will use the two currently active prompt configurations.
        Complete your profile first if prompted.
      </p>
      <section className="panel">
        <UploadForm adminMode />
      </section>
    </>
  );
}
