import type { TimelineEvent, TimelineKind } from "@/lib/types";
import { Db, DbBody, DbCell, DbHead, DbHeader, DbRow, td, th } from "@/components/db";
import { Tag, type TagColor } from "@/components/tag";
import { EvidenceTags } from "@/components/evidence-tags";
import { fmtTime } from "@/lib/format";

export const phaseLabel: Record<TimelineKind, string> = { leak: "Leak", theft: "Theft", attack: "Attack", notice: "Notice", context: "Context" };
export const phaseColor: Record<TimelineKind, TagColor> = { leak: "purple", theft: "orange", attack: "red", notice: "blue", context: "gray" };

export function TimelineTable({ events }: { events: TimelineEvent[] }) {
  return (
    <div className="overflow-x-auto">
      <Db>
        <DbHeader>
          <DbRow className="hover:bg-transparent">
            <DbHead className={th}>When (UTC)</DbHead>
            <DbHead className={th}>Phase</DbHead>
            <DbHead className={th}>What happened</DbHead>
            <DbHead className={th}>System</DbHead>
            <DbHead className={th}>Evidence</DbHead>
          </DbRow>
        </DbHeader>
        <DbBody>
          {events.map((e) => (
            <DbRow key={e.id} className="hover:bg-paper-2">
              <DbCell className={`${td} num whitespace-nowrap text-muted-foreground`}>{fmtTime(e.when)}</DbCell>
              <DbCell className={td}>
                <Tag color={phaseColor[e.kind]}>{phaseLabel[e.kind]}</Tag>
              </DbCell>
              <DbCell className={`${td} min-w-64 whitespace-normal`}>{e.title}</DbCell>
              <DbCell className={td}>
                <Tag>{e.system}</Tag>
              </DbCell>
              <DbCell className={td}>
                <EvidenceTags items={e.evidence} />
              </DbCell>
            </DbRow>
          ))}
        </DbBody>
      </Db>
    </div>
  );
}
