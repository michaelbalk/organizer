interface Props {
  icon: string
  title: string
  body: string
}

export function Placeholder({ icon, title, body }: Props): JSX.Element {
  return (
    <div className="placeholder">
      <div className="placeholder-icon">{icon}</div>
      <h2>{title}</h2>
      <p>{body}</p>
    </div>
  )
}
