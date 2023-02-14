import React from 'react';

import { useLoading, useProduceState } from '@swyx/hooks';
const faunadb = require('faunadb');
const q = faunadb.query;

export default function useFauna() {
  const [lists, setLists] = React.useState([]);
  const [client, setClient] = useProduceState(null, getServerLists);
  const [isLoading, load] = useLoading();
  const onAuthChange = async (faunadb_token) => {
    if (!faunadb_token) return null;
    const _client = new faunadb.Client({
      secret: faunadb_token,
    });
    setClient(_client);
    return _client;
  };

  async function getServerLists(_client = client) {
    if (!_client) return null;
    const r = await _client.query(
      q.Map(
        q.Paginate(
          q.Match(
            // todo use lists_by_owner
            q.Ref('indexes/all_lists')
          )
        ),
        (ref) => q.Get(ref)
      )
    );

    if (r.data.length === 0) {
      // create the first list for the user
      const me = q.Select('ref', q.Get(q.Ref('classes/users/self')));

      const defaultList = await client.query(
        q.Create(q.Class('lists'), {
          data: {
            title: 'Default Todo List',
            owner: q.Select('ref', q.Get(q.Ref('classes/users/self'))),
          },
          permissions: {
            read: me,
            write: me,
          },
        })
      );
      setLists([defaultList]);
    } else {
      setLists(r.data);
    }
  }

  const fetchList = async (id) => {
    if (client) {
      const _list = await client.query(q.Get(q.Ref('classes/lists/' + id)));
      const resp = await client.query(
        q.Map(q.Paginate(q.Match(q.Index('todos_by_list'), _list.ref)), (ref) =>
          q.Get(ref)
        )
      );
      return { list: _list, todos: resp.data };
    }
  };

  const addList = async (title) => {
    var newList = { title };
    const me = q.Select('ref', q.Get(q.Ref('classes/users/self')));
    newList.owner = me;
    await client.query(
      q.Create(q.Class('lists'), {
        data: newList,
        permissions: {
          read: me,
          write: me,
        },
      })
    );
    await getServerLists(client);
  };

  const addTodo = async (list, id) => async (title) => {
    var newTodo = {
      title: title,
      list: list.ref,
      completed: false,
    };

    const me = q.Select('ref', q.Get(q.Ref('classes/users/self')));
    newTodo.user = me;
    await client.query(
      q.Create(q.Ref('classes/todos'), {
        data: newTodo,
        permissions: {
          read: me,
          write: me,
        },
      })
    );
    return await fetchList(id);
  };

  // const toggleAll = (checked, list) => {
  //   return client.query(
  //     q.Map(q.Paginate(q.Match(q.Index('todos_by_list'), list.ref)), ref =>
  //       q.Update(q.Select('ref', q.Get(ref)), {
  //         data: {
  //           completed: q.Not(q.Select(['data', 'completed'], q.Get(ref)))
  //         }
  //       })
  //     )
  //   );
  // };

  const toggle = async (todoToToggle, id) => {
    await client.query(
      q.Update(todoToToggle.ref, {
        data: {
          completed: !todoToToggle.data.completed,
        },
      })
    );
    return await fetchList(id);
  };
  const destroy = async (todo, id) => {
    await client.query(q.Delete(todo.ref));
    return await fetchList(id);
  };

  const save = async (text) => async (todoToSave, id) => {
    await client.query(
      q.Update(todoToSave.ref, {
        data: { title: text },
      })
    );
    return await fetchList(id);
  };

  const clearCompleted = async (list, id) => {
    await client.query(
      q.Map(q.Paginate(q.Match(q.Index('todos_by_list'), list.ref)), (ref) =>
        q.If(
          q.Select(['data', 'completed'], q.Get(ref)),
          q.Delete(q.Select('ref', q.Get(ref))),
          true
        )
      )
    );
    return await fetchList(id);
  };

  return {
    lists,
    // list,
    fetchList,
    addList,
    addTodo,
    // toggleAll,
    getServerLists,
    load,
    toggle,
    destroy,
    save,
    clearCompleted,
    onAuthChange,
    isLoading,
    client,
  };
}
