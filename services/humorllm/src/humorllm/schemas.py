"""Stage schemas and referential integrity. IDs are checked, not trusted as grounding."""
from __future__ import annotations
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator

Short = Annotated[str, Field(min_length=1,max_length=180)]
Identifier = Annotated[str, Field(min_length=1,max_length=24,pattern=r'^[A-Za-z0-9_-]+$')]


class Record(BaseModel):
    model_config = ConfigDict(extra='forbid',str_strip_whitespace=True)


class Detail(Record):
    id: Identifier
    observation: Annotated[str,Field(min_length=1,max_length=200)]
    confidence: float = Field(ge=0,le=1)


class Scene(Record):
    title: Annotated[str,Field(min_length=1,max_length=100)]
    description: Annotated[str,Field(min_length=1,max_length=300)]
    details: list[Detail] = Field(min_length=1,max_length=8)
    image_text: list[Annotated[str,Field(min_length=1,max_length=240)]] = Field(max_length=8)
    uncertainties: list[Short] = Field(default_factory=list,max_length=8)

    @model_validator(mode='after')
    def unique(self):
        unique([d.id for d in self.details]);return self


class Conflict(Record):
    id: Identifier
    expectation: Short
    interpretation: Short
    detail_ids: list[Identifier] = Field(min_length=1,max_length=5)
    kind: Literal['observed','analogy']


class ConflictSet(Record):
    conflicts: list[Conflict] = Field(min_length=1,max_length=3)

    @model_validator(mode='after')
    def unique(self):
        unique([c.id for c in self.conflicts]);return self


class GroundedConflictSet(ConflictSet):
    verified_scene: Scene
    rejected_visual_claims: list[Short] = Field(max_length=8)


class Node(Record):
    entity: Annotated[str,Field(min_length=1,max_length=60)]
    relation: Short
    retrieval_query: Short | None = None


class Association(Record):
    id: Identifier
    root_detail_id: Identifier
    conflict_id: Identifier
    root_entity: Annotated[str,Field(min_length=1,max_length=60)]
    nodes: list[Node] = Field(min_length=1,max_length=3)


class AssociationSet(Record):
    paths: list[Association] = Field(min_length=1,max_length=2)

    @model_validator(mode='after')
    def unique(self):
        unique([p.id for p in self.paths]);return self


class PathChoice(Record):
    selected_path_ids: list[Identifier] = Field(min_length=1,max_length=5)
    selected_source_ids: list[Identifier] = Field(max_length=5)
    reason: Short


class SourceApplication(Record):
    source_id: Identifier
    caption_span: Annotated[str,Field(min_length=1,max_length=240)]
    adaptation: Short


class Candidate(Record):
    id: Identifier
    caption: Annotated[str,Field(min_length=1,max_length=240)]
    mechanism: Short
    detail_ids: list[Identifier] = Field(min_length=1,max_length=5)
    path_ids: list[Identifier] = Field(min_length=1,max_length=3)
    retrieval_ids: list[Identifier] = Field(max_length=5)
    source_applications: list[SourceApplication] = Field(default_factory=list,max_length=5)


class CandidateSet(Record):
    candidates: list[Candidate] = Field(min_length=5,max_length=5)

    @model_validator(mode='after')
    def unique(self):
        unique([c.id for c in self.candidates]);unique([normalize(c.caption) for c in self.candidates]);return self


class Caption(Record):
    caption: Annotated[str,Field(min_length=1,max_length=240)]


class SourceCheck(Record):
    source_id: Identifier
    supported: bool
    reason: Short
    setup_span: str = Field(default='',max_length=240)
    turn_span: str = Field(default='',max_length=240)


class LiteralClaim(Record):
    caption_span: Annotated[str,Field(min_length=1,max_length=240)]
    detail_id: str = Field(max_length=24)
    kind: Literal['literal','analogy']


class Judgment(Record):
    candidate_id: Identifier
    accepted: bool
    detail_ids: list[Identifier] = Field(max_length=5)
    unsupported_premises: list[Short] = Field(max_length=5)
    safety_flags: list[Short] = Field(max_length=5)
    rank: int = Field(ge=1,le=5)
    reason: Short
    source_checks: list[SourceCheck] = Field(default_factory=list,max_length=5)
    literal_claims: list[LiteralClaim] = Field(max_length=8)


class Selection(Record):
    judgments: list[Judgment] = Field(min_length=5,max_length=5)


def unique(values):
    if len(set(values))!=len(values):raise ValueError('Duplicate IDs or captions.')


def normalize(text):
    return ''.join(c.lower() for c in text if c.isalnum())


def subset(values,allowed,label):
    unique(values)
    if not set(values)<=set(allowed):raise ValueError('Invented '+label+' reference.')


def validate_links(scene: Scene, conflicts: ConflictSet, associations: AssociationSet | None = None,
                   candidates: CandidateSet | None = None, selection: Selection | None = None,
                   *, path_ids=(), source_ids=()):
    details = {d.id for d in scene.details}
    for conflict in conflicts.conflicts:subset(conflict.detail_ids,details,'detail')
    if associations:
        for path in associations.paths:
            subset([path.root_detail_id],details,'root detail')
            subset([path.conflict_id],[c.id for c in conflicts.conflicts],'conflict')
    if candidates:
        for c in candidates.candidates:
            subset(c.detail_ids,details,'candidate detail');subset(c.path_ids,path_ids,'path')
            subset(c.retrieval_ids,source_ids,'retrieval')
            application_ids=[a.source_id for a in c.source_applications]
            subset(application_ids,c.retrieval_ids,'source application')
            if set(application_ids)!=set(c.retrieval_ids):raise ValueError('Each claimed source needs a caption application.')
            if any(a.caption_span!=c.caption for a in c.source_applications):
                raise ValueError('Source application must quote the ENTIRE caption so both setup and turn are covered.')
    if selection:
        if not candidates:raise ValueError('Candidates required to validate selection.')
        ids = [c.id for c in candidates.candidates]
        subset([j.candidate_id for j in selection.judgments],ids,'judgment candidate')
        if len(selection.judgments)!=len(ids):raise ValueError('Missing candidate judgments.')
        unique([j.rank for j in selection.judgments])
        by_id = {c.id:c for c in candidates.candidates}
        for j in selection.judgments:
            subset(j.detail_ids,details,'judgment evidence')
            ids=[s.source_id for s in j.source_checks]
            subset(ids,by_id[j.candidate_id].retrieval_ids,'source check')
            if set(ids)!=set(by_id[j.candidate_id].retrieval_ids):raise ValueError('Judge must check every claimed source.')
            # Contradictory acceptance/unsupported-premise flags reject that candidate in rank.py.
            # Do not discard other valid candidates or spend a repair call to change a boolean.
