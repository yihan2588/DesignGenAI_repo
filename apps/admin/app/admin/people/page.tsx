import { requireAdmin } from "@/lib/admin";
import { SignupRules } from "./signup-rules";
import type { SignupRule } from "@/lib/funny/signup";
import { adminData, timestamp } from "@/lib/funny/data";
import type { People } from "@/lib/funny/types";
import { queryPage, queryText } from "@/lib/funny/validation";
import { Empty, PageHeading, Pagination, Search, Status } from "../components/common";
export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const p = await searchParams, page = queryPage(p.page), q = queryText(p.q), s = await adminData<People>("people", page, q);
  const {client}=await requireAdmin();
  const {data:access,error}=await client.rpc("funny_signup_access");
  if(error)throw new Error("Signup rules could not be loaded. Please retry.");
  return <><PageHeading title="People & access">Manage signup eligibility, review members, and see who administers FunnyLLM.</PageHeading><SignupRules enforced={access?.enforced===true} rules={(access?.rules??[]) as SignupRule[]}/><section className="section-block access-summary"><div><h2>Public gallery</h2><p>Anyone can browse without signing in. Signup rules apply to new accounts only.</p></div><div><h2>Admin app</h2><p>Google sign-in must match one of these addresses. This list is enforced in the database and cannot be edited here.</p><ul>{s.admins.map(a => <li key={a.email}>{a.email}</li>)}</ul></div></section><section className="section-block"><h2>Registered users</h2><Search q={q} placeholder="Search names or email addresses" />{s.users.length ? <div className="table-scroll"><table><thead><tr><th>Name</th><th>Email</th><th>Joined</th><th>Access</th></tr></thead><tbody>{s.users.map(u => <tr key={u.id}><td>{[u.first_name, u.last_name].filter(Boolean).join(" ") || "Name not provided"}</td><td>{u.email}</td><td>{timestamp(u.created_at)}</td><td><Status value={u.is_admin ? "admin" : "member"} /></td></tr>)}</tbody></table></div> : <Empty>{q ? "No users match this search." : "Registered Google accounts will appear here."}</Empty>}<Pagination base="/admin/people" page={page} more={s.more} q={q} /></section></>;
}
