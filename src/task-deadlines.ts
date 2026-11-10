type DatedTask={pinned?:boolean;due_at?:string|null;completed_at?:string|null;deleted?:boolean;state?:string;status?:string};
export function deadlineState(task:DatedTask,now=Date.now()):'overdue'|'soon'|null{
 if(task.deleted||task.completed_at||task.state&&task.state!=='active'||task.status&& !['active','overdue'].includes(task.status)||!task.due_at)return null;
 const remaining=Date.parse(task.due_at)-now;
 return remaining<=0?'overdue':remaining<=48*60*60*1000?'soon':null;
}
export function taskPriority(task:DatedTask,now=Date.now()){
 return task.pinned?0:deadlineState(task,now)==='overdue'?1:deadlineState(task,now)==='soon'?2:3;
}
export function deadlineBadge(task:DatedTask,now=Date.now()){
 const state=deadlineState(task,now);
 return state?`<span class="task-deadline is-${state}">${state==='overdue'?'Overdue':'Due soon · high priority'}</span>`:'';
}
