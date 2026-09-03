import { useState } from "react";
import { clients } from "../db/repo";
import { useStore } from "../state/store";

interface DraftContact {
  name: string;
  detail: string;
}

/**
 * The new-client sheet. The name is all that's required; the same sheet then
 * grows rows for projects and contacts, added inline, and one save writes the
 * lot. Names are unique per client, so two clients can each have a John.
 */
export function NewClientSheet({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (clientId: number) => void;
}) {
  const { act } = useStore();
  const [step, setStep] = useState<"name" | "grow">("name");
  const [name, setName] = useState("");
  const [projects, setProjects] = useState<string[]>([]);
  const [projectDraft, setProjectDraft] = useState("");
  const [contacts, setContacts] = useState<DraftContact[]>([]);
  const [contactName, setContactName] = useState("");
  const [contactDetail, setContactDetail] = useState("");

  const addProject = () => {
    const trimmed = projectDraft.trim();
    if (!trimmed) return;
    setProjects((p) => [...p, trimmed]);
    setProjectDraft("");
  };

  const addContact = () => {
    const trimmed = contactName.trim();
    if (!trimmed) return;
    setContacts((c) => [...c, { name: trimmed, detail: contactDetail.trim() }]);
    setContactName("");
    setContactDetail("");
  };

  const save = () => {
    if (!name.trim()) return;
    // A half-typed row someone forgot to ⏎ still counts.
    const allProjects = [...projects, projectDraft.trim()].filter(Boolean);
    const allContacts = [
      ...contacts,
      ...(contactName.trim() ? [{ name: contactName.trim(), detail: contactDetail.trim() }] : []),
    ];
    let created = 0;
    void act(async (db, c) => {
      created = await clients.createFull(db, c, {
        name,
        projects: allProjects,
        contacts: allContacts.map((person) => {
          // "Webshop · lead" — the first part is a project if it names one.
          const [head, ...rest] = person.detail.split("·").map((s) => s.trim());
          const isProject = allProjects.some(
            (p) => p.toLowerCase() === head?.toLowerCase(),
          );
          return {
            name: person.name,
            projectName: isProject ? head : null,
            role: (isProject ? rest.join(" · ") : person.detail) || null,
          };
        }),
      });
    }).then(() => onCreated(created));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/70 py-[12vh]"
      onMouseDown={onClose}
    >
      <div
        className="h-fit w-[560px] overflow-hidden rounded-xl border border-[#313734] bg-hover shadow-[0_22px_55px_rgba(0,0,0,.55)]"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <div className="flex flex-col gap-2.5 px-7 pt-6 pb-5">
          <span className="label text-[11px] tracking-[.1em] text-muted">Client</span>
          {step === "name" ? (
            <>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && name.trim()) setStep("grow");
                }}
                placeholder="Who are you working with?"
                className="w-full border-b border-outline-hover bg-transparent pb-2.5 text-2xl text-text outline-none placeholder:text-faint"
              />
              <span className="fact pt-1.5 text-[11px] text-faint">
                ⏎ continue · you can add the rest whenever
              </span>
            </>
          ) : (
            <span className="text-2xl text-text">{name}</span>
          )}
        </div>

        {step === "grow" && (
          <>
            <div className="flex flex-col gap-3.5 border-t border-[#242927] bg-[#141716] px-7 py-5">
              <span className="label text-[11px] tracking-[.1em] text-muted">Projects</span>
              <div className="flex flex-col gap-0.5">
                {projects.map((project, index) => (
                  <div
                    key={`${project}-${index}`}
                    className="flex items-center gap-3 border-t border-[#1f2422] py-[11px]"
                  >
                    <span className="flex-1 text-base text-text">{project}</span>
                    <button
                      type="button"
                      onClick={() => setProjects((p) => p.filter((_, i) => i !== index))}
                      className="text-sm text-sleeping transition-colors hover:text-soft"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <div className="flex items-center gap-3 border-t border-[#1f2422] py-[11px]">
                  <input
                    autoFocus
                    value={projectDraft}
                    onChange={(e) => setProjectDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addProject();
                    }}
                    placeholder="Add a project"
                    className="flex-1 bg-transparent text-base text-text outline-none placeholder:text-sleeping"
                  />
                  <span className="fact text-[11px] text-faint">⏎ adds another</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3.5 border-t border-[#242927] bg-[#141716] px-7 py-5">
              <span className="label text-[11px] tracking-[.1em] text-muted">Contacts</span>
              <div className="flex flex-col gap-0.5">
                {contacts.map((person, index) => (
                  <div
                    key={`${person.name}-${index}`}
                    className="flex items-center gap-3 border-t border-[#1f2422] py-[11px]"
                  >
                    <span className="w-[180px] truncate text-base text-text">{person.name}</span>
                    <span className="flex-1 truncate text-[15px] text-muted">
                      {person.detail}
                    </span>
                    <button
                      type="button"
                      onClick={() => setContacts((c) => c.filter((_, i) => i !== index))}
                      className="text-sm text-sleeping transition-colors hover:text-soft"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <div className="flex items-center gap-3 border-t border-[#1f2422] py-[11px]">
                  <input
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addContact();
                    }}
                    placeholder="Name"
                    className="w-[180px] bg-transparent text-base text-text outline-none placeholder:text-sleeping"
                  />
                  <input
                    value={contactDetail}
                    onChange={(e) => setContactDetail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addContact();
                    }}
                    placeholder="which project, and what they do"
                    className="flex-1 bg-transparent text-[15px] text-text outline-none placeholder:text-[#565e5a]"
                  />
                  <span className="fact text-[11px] text-faint">optional</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 border-t border-[#242927] px-7 py-4">
              <button
                type="button"
                onClick={save}
                className="rounded-[7px] bg-green px-4 py-[9px] text-sm text-ink transition-colors hover:bg-green-hover"
              >
                Save client
              </button>
              <span className="fact text-[11px] leading-snug text-faint">
                names are unique per client, so two clients can each have a John
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
