alter table wish_match drop constraint if exists wish_match_basis_check;
alter table wish_match add constraint wish_match_basis_check
  check (basis is null or basis in ('qloo', 'text', 'type'));

update wish_maker set remote_ok = true where id = 'm03';

-- cleanup: your test applicant (matches are removed with it) and the m01 test tag
delete from wish_maker where id = 'mk_4e24714e8f1b';
update wish_maker set qloo_tags = '[]' where id = 'm01';