-- Allow the commissioner to delete their own league
create policy "leagues_delete_commissioner"
  on public.leagues for delete
  using (commissioner_id = auth.uid());
