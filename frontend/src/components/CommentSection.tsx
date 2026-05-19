interface Props {
  viewName: string;
  value: string;
  onChange: (v: string) => void;
  readonly?: boolean;
}

export function CommentSection({ viewName, value, onChange, readonly }: Props) {
  return (
    <section className="comment-section">
      <div className="comment-header">
        <h3 className="comment-title">Commentaire</h3>
        <span className="comment-meta">Vue : {viewName}</span>
      </div>
      {readonly ? (
        <div className={`comment-readonly ${value.trim() === '' ? 'empty' : ''}`}>
          {value.trim() === '' ? 'Aucun commentaire saisi pour cette vue.' : value}
        </div>
      ) : (
        <textarea
          className="comment-textarea"
          placeholder={`Saisir un commentaire pour la vue « ${viewName} » (visible dans l'export PDF)`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </section>
  );
}
